import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';
import { EntityManager, RequestContext } from '@mikro-orm/postgresql';
import { InboxRepository } from '../persistence/repositories/inbox.repository';
import { InboxMessage } from '../../domain/value-objects/inbox-message';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';

export interface MessageHandler {
  handle(message: Record<string, unknown>): Promise<'TERMINAL' | 'TRANSIENT'>;
}

@Injectable()
export class SqsConsumer extends EventEmitter implements OnModuleDestroy {
  private readonly logger = new Logger(SqsConsumer.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private inflight = new Map<string, Promise<void>>();
  private shutdownResolve: (() => void) | null = null;

  constructor(
    private readonly inboxRepository: InboxRepository,
    @Inject(EntityManager) private readonly em: EntityManager,
  ) {
    super();
  }

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

  start(
    queueUrl: string,
    handler: MessageHandler,
    dlqUrl?: string,
    intervalMs: number = 1000,
    maxReceiveCount: number = 5,
  ): void {
    if (this.running) return;
    this.running = true;
    this.logger.log(`Starting SQS consumer for ${queueUrl}`);

    const sqs = this.createSqsClient();

    this.intervalId = setInterval(async () => {
      if (!this.running) return;
      try {
        await this.poll(sqs, queueUrl, handler, dlqUrl, maxReceiveCount);
      } catch (error) {
        this.logger.error(`SQS poll error: ${error}`);
      }
    }, intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.logger.log('SQS consumer stopped');
  }

  async gracefulShutdown(): Promise<void> {
    this.logger.log('Initiating graceful SQS consumer shutdown...');
    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.inflight.size > 0) {
      this.logger.log(`Waiting for ${this.inflight.size} inflight messages to complete...`);
      await Promise.allSettled(this.inflight.values());
    }

    this.logger.log('SQS consumer gracefully shut down');
  }

  onModuleDestroy(): void {
    this.stop();
  }

  private async poll(
    sqs: SQSClient,
    queueUrl: string,
    handler: MessageHandler,
    dlqUrl?: string,
    maxReceiveCount: number = 5,
  ): Promise<void> {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 0,
      VisibilityTimeout: 30,
      AttributeNames: ['All'],
    });

    const response = await sqs.send(command);
    if (!response.Messages) return;

    for (const message of response.Messages) {
      if (!message.MessageId || !message.Body) continue;

      const processingPromise = this.processMessage(
        sqs, queueUrl, handler, message, dlqUrl, maxReceiveCount,
      );

      this.inflight.set(message.MessageId, processingPromise);
      processingPromise.finally(() => this.inflight.delete(message.MessageId!));
    }
  }

  private async processMessage(
    sqs: SQSClient,
    queueUrl: string,
    handler: MessageHandler,
    message: NonNullable<import('@aws-sdk/client-sqs').ReceiveMessageResult['Messages']>[number],
    dlqUrl?: string,
    maxReceiveCount: number = 5,
  ): Promise<void> {
    const messageId = message.MessageId!;
    let body: Record<string, unknown>;

    try {
      body = JSON.parse(message.Body!);
    } catch {
      this.logger.error(`Invalid JSON in message ${messageId}, sending to DLQ`);
      await this.sendToDlq(sqs, dlqUrl, message);
      await this.ack(sqs, queueUrl, message.ReceiptHandle!);
      return;
    }

    const internalMessageId = (body.messageId as string) || messageId;
    const consumerName = 'wagering-processor';
    let skipAck = false;

    try {
      await RequestContext.create(this.em, async () => {
        const existing = await this.inboxRepository.findByConsumerAndMessageId(consumerName, internalMessageId);
        if (existing?.isProcessed()) {
          this.logger.debug(`Message ${internalMessageId} already processed, skipping`);
          skipAck = true;
          return;
        }

        if (!existing) {
          const inboxMessage = InboxMessage.receive({
            messageId: internalMessageId,
            consumerName,
            payloadHash: this.hashPayload(body),
          });
          await this.inboxRepository.save(inboxMessage);
        }

        const result = await handler.handle(body);

        if (result === 'TERMINAL' || skipAck) {
          return;
        }

        const msg = await this.inboxRepository.findByConsumerAndMessageId(consumerName, internalMessageId);
        if (msg) {
          msg.markProcessed(new Date());
          await this.inboxRepository.save(msg);
        }
      });
    } catch (error) {
      const isTerminal = this.isTerminalError(error);

      if (isTerminal) {
        this.logger.error(`Terminal error processing message ${messageId}: ${error}`);
        await this.sendToDlq(sqs, dlqUrl, message);
        await this.ack(sqs, queueUrl, message.ReceiptHandle!);
        return;
      }

      const receiveCount = parseInt(message.Attributes?.ApproximateReceiveCount || '0', 10);
      if (receiveCount >= maxReceiveCount) {
        this.logger.error(`Message ${messageId} exceeded max retries (${maxReceiveCount}), sending to DLQ`);
        await this.sendToDlq(sqs, dlqUrl, message);
        await this.ack(sqs, queueUrl, message.ReceiptHandle!);
        return;
      }

      this.logger.warn(`Transient error processing message ${messageId} (attempt ${receiveCount}/${maxReceiveCount}): ${error}`);
      await this.nack(sqs, queueUrl, message.ReceiptHandle!);
      return;
    }

    if (skipAck) {
      await this.ack(sqs, queueUrl, message.ReceiptHandle!);
    } else {
      await this.ack(sqs, queueUrl, message.ReceiptHandle!);
      this.logger.log(`Message ${messageId} processed successfully`);
    }
  }

  private isTerminalError(error: unknown): boolean {
    if (error instanceof Error) {
      const terminalPatterns = [
        'DUPLICATE_IDEMPOTENCY_KEY',
        'REFERENCE_ALREADY_REVERSED',
        'INVALID_REFERENCE_KIND',
        'REFERENCE_VALUE_MISMATCH',
        'PLAYER_MISMATCH',
        'CURRENCY_MISMATCH',
        'Player does not own',
        'Currency mismatch',
      ];
      return terminalPatterns.some((p) => error.message.includes(p));
    }
    return false;
  }

  private async sendToDlq(
    sqs: SQSClient,
    dlqUrl: string | undefined,
    message: NonNullable<import('@aws-sdk/client-sqs').ReceiveMessageResult['Messages']>[number],
  ): Promise<void> {
    if (!dlqUrl) {
      this.logger.warn(`No DLQ URL configured, message ${message.MessageId} discarded`);
      return;
    }

    try {
      await sqs.send(new (await import('@aws-sdk/client-sqs')).SendMessageCommand({
        QueueUrl: dlqUrl,
        MessageBody: message.Body!,
        MessageGroupId: 'default',
      }));
      this.logger.log(`Message ${message.MessageId} sent to DLQ`);
    } catch (dlqError) {
      this.logger.error(`Failed to send message ${message.MessageId} to DLQ: ${dlqError}`);
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
