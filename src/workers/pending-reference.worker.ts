import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RequestContext } from '@mikro-orm/postgresql';
import { Inject } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { TransactionService } from '../modules/wagering/application/services/transaction.service';

@Injectable()
export class PendingReferenceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PendingReferenceWorker.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly transactionService: TransactionService,
    @Inject(EntityManager) private readonly em: EntityManager,
  ) {}

  onModuleInit(): void {
    this.logger.log('Starting PENDING_REFERENCE worker (every 5s)');
    this.running = true;

    this.intervalId = setInterval(async () => {
      if (!this.running) return;
      try {
        await RequestContext.create(this.em, async () => {
          const processed = await this.transactionService.processPendingReferences(50);
          if (processed > 0) {
            this.logger.log(`Processed ${processed} pending references`);
          }
        });
      } catch (error) {
        this.logger.error(`PENDING_REFERENCE worker error: ${error}`);
      }
    }, 5000);
  }

  onModuleDestroy(): void {
    this.logger.log('Stopping PENDING_REFERENCE worker');
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
