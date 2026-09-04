import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { OutboxPublisher } from '../modules/shared/infrastructure/workers/outbox-publisher';

@Injectable()
export class OutboxPublisherWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherWorker.name);

  constructor(
    private readonly outboxPublisher: OutboxPublisher,
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

  onModuleInit(): void {
    const eventsQueueUrl = process.env.SQS_EVENTS_QUEUE_URL || 'http://localhost:4566/000000000000/wager-events.fifo';
    const sqs = this.createSqsClient();

    this.logger.log(`Starting outbox publisher worker → SQS events: ${eventsQueueUrl}`);
    this.outboxPublisher.start({
      publish: async (eventType: string, payload: Record<string, unknown>) => {
        const messageBody = JSON.stringify({
          eventType,
          messageId: payload.id || payload.eventId,
          ...payload,
        });

        await sqs.send(new SendMessageCommand({
          QueueUrl: eventsQueueUrl,
          MessageBody: messageBody,
          MessageGroupId: payload.aggregateId as string || 'default',
          MessageDeduplicationId: payload.id as string || payload.eventId as string,
        }));

        this.logger.debug(`Published event ${eventType} to SQS events queue`);
      },
    }, 2000);
  }

  onModuleDestroy(): void {
    this.logger.log('Stopping outbox publisher worker');
    this.outboxPublisher.stop();
  }
}
