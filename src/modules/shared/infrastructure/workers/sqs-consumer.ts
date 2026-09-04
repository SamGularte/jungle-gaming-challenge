import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';
import { EntityManager, RequestContext } from '@mikro-orm/postgresql';
import { InboxRepository } from '../persistence/repositories/inbox.repository';
import { InboxMessage } from '../../domain/value-objects/inbox-message';
import { createHash } from 'crypto';

export interface MessageHandler {
  handle(message: Record<string, unknown>): Promise<void>;
}

@Injectable()
export class SqsConsumer implements OnModuleDestroy {
  private readonly logger = new Logger(SqsConsumer.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private processing = new Set<string>();

  constructor(
    private readonly inboxRepository: InboxRepository,
    @Inject(EntityManager) private readonly em: EntityManager,
  ) {}

  private createSqsClient(): SQSClient {
    return new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT || 'http://localhost:4566',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
    });
  }

  start(queueUrl: string, handler: MessageHandler, intervalMs: number = 1000): void {
    if (this.running) return;
    this.running = true;
    this.logger.log(`Starting SQS consumer for ${queueUrl}`);

    const sqs = this.createSqsClient();

    this.intervalId = setInterval(async () => {
      try {
        await this.poll(sqs, queueUrl, handler);
      } catch (error) {
        this.logger.error(`SQS poll error: ${error}`);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    this.logger.log('SQS consumer stopped');
  }

  onModuleDestroy(): void {
    this.stop();
  }

  private async poll(sqs: SQSClient, queueUrl: string, handler: MessageHandler): Promise<void> {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 0,
      VisibilityTimeout: 30,
    });

    const response = await sqs.send(command);
    if (!response.Messages) return;

    for (const message of response.Messages) {
      if (!message.MessageId || !message.Body) continue;
      if (this.processing.has(message.MessageId)) continue;

      this.processing.add(message.MessageId);

      try {
        const body = JSON.parse(message.Body);
        const messageId = body.messageId || message.MessageId;
        const consumerName = 'wagering-processor';

        let skipAck = false;

        await RequestContext.create(this.em, async () => {
          const existing = await this.inboxRepository.findByConsumerAndMessageId(consumerName, messageId);
          if (existing?.isProcessed()) {
            this.logger.debug(`Message ${messageId} already processed, skipping`);
            skipAck = true;
            return;
          }

          if (!existing) {
            const inboxMessage = InboxMessage.receive({
              messageId,
              consumerName,
              payloadHash: this.hashPayload(body),
            });
            await this.inboxRepository.save(inboxMessage);
          }

          await handler.handle(body);

          const msg = await this.inboxRepository.findByConsumerAndMessageId(consumerName, messageId);
          if (msg) {
            msg.markProcessed(new Date());
            await this.inboxRepository.save(msg);
          }
        });

        if (skipAck) {
          await this.ack(sqs, queueUrl, message.ReceiptHandle!);
        } else {
          await this.ack(sqs, queueUrl, message.ReceiptHandle!);
          this.logger.log(`Message ${messageId} processed successfully`);
        }
      } catch (error) {
        this.logger.error(`Error processing message ${message.MessageId}: ${error}`);
        await this.nack(sqs, queueUrl, message.ReceiptHandle!);
      } finally {
        this.processing.delete(message.MessageId!);
      }
    }
  }

  private async ack(sqs: SQSClient, queueUrl: string, receiptHandle: string): Promise<void> {
    await sqs.send(new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    }));
  }

  private async nack(sqs: SQSClient, queueUrl: string, receiptHandle: string): Promise<void> {
    await sqs.send(new ChangeMessageVisibilityCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: 0,
    }));
  }

  private hashPayload(payload: Record<string, unknown>): string {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    return createHash('sha256').update(canonical).digest('hex');
  }
}
