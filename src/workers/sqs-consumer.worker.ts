import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SqsConsumer } from '../modules/shared/infrastructure/workers/sqs-consumer';
import { TransactionService } from '../modules/wagering/application/services/transaction.service';

@Injectable()
export class SqsConsumerWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqsConsumerWorker.name);

  constructor(
    private readonly sqsConsumer: SqsConsumer,
    private readonly transactionService: TransactionService,
  ) {}

  onModuleInit(): void {
    const queueUrl = process.env.SQS_WAGER_QUEUE_URL || 'http://localhost:4566/000000000000/wager-transactions.fifo';
    const dlqUrl = process.env.SQS_WAGER_DLQ_URL || 'http://localhost:4566/000000000000/wager-transactions-dlq.fifo';

    this.logger.log(`Starting SQS consumer worker for ${queueUrl} (DLQ: ${dlqUrl})`);

    this.sqsConsumer.start(queueUrl, {
      handle: async (message: Record<string, unknown>) => {
        const data = message.data as Record<string, unknown>;
        if (!data) {
          this.logger.warn('Received message without data');
          return 'TERMINAL';
        }

        try {
          await this.transactionService.process({
            idempotencyKey: (data.idempotencyKey as string) || `${data.providerId}:${data.externalTransactionId}`,
            providerId: data.providerId as string,
            externalTransactionId: data.externalTransactionId as string,
            playerId: data.playerId as string,
            walletId: data.walletId as string,
            roundId: data.roundId as string,
            gameId: data.gameId as string,
            kind: data.kind as string,
            money: data.money as { amount: string; currency: string },
            referenceExternalTransactionId: data.referenceExternalTransactionId as string | undefined,
          });
          return 'TERMINAL';
        } catch (error) {
          const err = error as Error;
          const terminalMessages = [
            'DUPLICATE_IDEMPOTENCY_KEY',
            'Player does not own',
            'Currency mismatch',
            'REFERENCE_ALREADY_REVERSED',
            'INVALID_REFERENCE_KIND',
            'REFERENCE_VALUE_MISMATCH',
            'PLAYER_MISMATCH',
            'CURRENCY_MISMATCH',
            'OPENING transactions are internal',
            'requires a reference external',
          ];

          if (terminalMessages.some((m) => err.message.includes(m))) {
            return 'TERMINAL';
          }
          return 'TRANSIENT';
        }
      },
    }, dlqUrl, 2000, 5);
  }

  onModuleDestroy(): void {
    this.logger.log('Stopping SQS consumer worker');
    this.sqsConsumer.stop();
  }
}
