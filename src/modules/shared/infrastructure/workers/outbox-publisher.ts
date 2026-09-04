import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EntityManager, RequestContext } from '@mikro-orm/postgresql';
import { OutboxRepository } from '../persistence/repositories/outbox.repository';
import { OutboxMessage } from '../../domain/value-objects/outbox-message';

export interface EventPublisher {
  publish(eventType: string, payload: Record<string, unknown>): Promise<void>;
}

@Injectable()
export class OutboxPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisher.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly outboxRepository: OutboxRepository,
    @Inject(EntityManager) private readonly em: EntityManager,
  ) {}

  start(publisher: EventPublisher, intervalMs: number = 1000): void {
    if (this.running) return;
    this.running = true;
    this.logger.log(`Starting outbox publisher with ${intervalMs}ms interval`);

    this.intervalId = setInterval(async () => {
      try {
        await this.publishPending(publisher);
      } catch (error) {
        this.logger.error(`Outbox publisher error: ${error}`);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    this.logger.log('Outbox publisher stopped');
  }

  onModuleDestroy(): void {
    this.stop();
  }

  async publishPending(publisher: EventPublisher): Promise<number> {
    let published = 0;

    await RequestContext.create(this.em, async () => {
      const pending = await this.outboxRepository.findPendingDue(10);

      for (const message of pending) {
        try {
          await publisher.publish(message.eventType, { ...message.payload });
          message.markPublished(new Date());
          await this.outboxRepository.save(message);
          published++;
          this.logger.debug(`Published event: ${message.eventType} (${message.id})`);
        } catch (error) {
          this.logger.warn(`Failed to publish event ${message.id}: ${error}`);
          message.scheduleRetry(new Date());

          if (message.hasExceededMaxAttempts()) {
            this.logger.error(`Event ${message.id} exceeded max attempts, marking as failed`);
          }

          await this.outboxRepository.save(message);
        }
      }
    });

    return published;
  }
}
