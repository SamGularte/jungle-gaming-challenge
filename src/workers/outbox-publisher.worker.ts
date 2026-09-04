import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OutboxPublisher } from '../modules/shared/infrastructure/workers/outbox-publisher';
import { SqsConsumer } from '../modules/shared/infrastructure/workers/sqs-consumer';
import { TransactionService } from '../modules/wagering/application/services/transaction.service';

@Injectable()
export class OutboxPublisherWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherWorker.name);

  constructor(
    private readonly outboxPublisher: OutboxPublisher,
  ) {}

  onModuleInit(): void {
    this.logger.log('Starting outbox publisher worker');
    this.outboxPublisher.start({
      publish: async (eventType: string, payload: Record<string, unknown>) => {
        this.logger.log(`Publishing event: ${eventType}`);
      },
    }, 2000);
  }

  onModuleDestroy(): void {
    this.logger.log('Stopping outbox publisher worker');
    this.outboxPublisher.stop();
  }
}
