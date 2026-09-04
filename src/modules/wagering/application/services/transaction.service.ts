import { Inject, Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus, FailureCode } from '../../domain/aggregates/wager-transaction';
import { Money } from '../../../wallet/domain/value-objects/money';
import { WagerTransactionRepository } from '../../infrastructure/persistence/repositories/wager-transaction.repository';
import { WalletRepository } from '../../../wallet/infrastructure/persistence/repositories/wallet.repository';
import { LedgerRepository } from '../../../wallet/infrastructure/persistence/repositories/ledger.repository';
import { OutboxMessage } from '../../../shared/domain/value-objects/outbox-message';
import { OutboxRepository } from '../../../shared/infrastructure/persistence/repositories/outbox.repository';
import { WagerTransactionProcessedEvent } from '../../domain/events/wager-transaction-processed.event';
import { WagerTransactionRejectedEvent } from '../../domain/events/wager-transaction-rejected.event';
import { WagerTransactionPendingReferenceEvent } from '../../domain/events/wager-transaction-pending-reference.event';
import { WalletBalanceChangedEvent } from '../../../wallet/domain/events/wallet-balance-changed.event';
import { randomUUID, createHash } from 'crypto';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    private readonly transactionRepository: WagerTransactionRepository,
    private readonly walletRepository: WalletRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly outboxRepository: OutboxRepository,
    @Inject(EntityManager) private readonly em: EntityManager,
  ) {}

  private hashPayload(props: Record<string, unknown>): string {
    const canonical = JSON.stringify(props, Object.keys(props).sort());
    return createHash('sha256').update(canonical).digest('hex');
  }

  private async getBalance(walletId: string) {
    const wallet = await this.walletRepository.findById(walletId);
    return wallet?.balance.toJSON();
  }

  private async findExistingReversal(
    referenceId: string,
    kind: WagerTransactionKind,
    walletId: string,
  ): Promise<WagerTransaction | null> {
    const existingReversals = await this.transactionRepository.findByReferenceTransactionId(referenceId);
    return existingReversals.find(
      (t) => t.kind === kind && t.walletId === walletId && t.status === WagerTransactionStatus.PROCESSED,
    ) ?? null;
  }

  async process(props: {
    idempotencyKey: string;
    providerId: string;
    externalTransactionId: string;
    playerId: string;
    walletId: string;
    roundId: string;
    gameId: string;
    kind: string;
    money: { amount: string; currency: string };
    referenceExternalTransactionId?: string;
  }) {
    return this.em.transactional(async () => {
      this.logger.log(`Processing transaction: kind=${props.kind} provider=${props.providerId} external=${props.externalTransactionId} player=${props.playerId} wallet=${props.walletId}`);

      const existing = await this.transactionRepository.findByIdempotencyKey(props.idempotencyKey);
      if (existing) {
        this.logger.log(`Idempotent replay: transaction ${existing.id} already exists with status ${existing.status}`);
        return {
          transactionId: existing.id,
          status: existing.status,
          balance: existing.affectsBalance() ? await this.getBalance(existing.walletId) : undefined,
          idempotentReplay: true,
        };
      }

      const wallet = await this.walletRepository.findByIdForUpdate(props.walletId);
      if (!wallet) {
        this.logger.warn(`Wallet not found: ${props.walletId}`);
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.playerId !== props.playerId) {
        this.logger.warn(`Player ${props.playerId} does not own wallet ${props.walletId}`);
        throw new ConflictException('Player does not own this wallet');
      }

      if (wallet.currency !== props.money.currency) {
        this.logger.warn(`Currency mismatch: wallet=${wallet.currency} transaction=${props.money.currency}`);
        throw new ConflictException('Currency mismatch');
      }

      const transaction = WagerTransaction.create({
        id: randomUUID(),
        providerId: props.providerId,
        externalTransactionId: props.externalTransactionId,
        idempotencyKey: props.idempotencyKey,
        payloadHash: this.hashPayload(props),
        walletId: props.walletId,
        playerId: props.playerId,
        roundId: props.roundId,
        gameId: props.gameId,
        kind: props.kind as WagerTransactionKind,
        money: Money.from(props.money),
        referenceExternalTransactionId: props.referenceExternalTransactionId,
      });

      let reference: WagerTransaction | undefined;
      if (transaction.requiresReference()) {
        this.logger.debug(`Transaction ${transaction.id} requires reference: ${props.referenceExternalTransactionId}`);
        reference = await this.transactionRepository.findByProviderAndExternalId(
          props.providerId,
          props.referenceExternalTransactionId!,
        ) ?? undefined;

        if (!reference || reference.status !== WagerTransactionStatus.PROCESSED) {
          this.logger.log(`Transaction ${transaction.id} marked as PENDING_REFERENCE (ref exists: ${!!reference})`);
          transaction.markPendingReference();
          await this.transactionRepository.save(transaction);

          const event = WagerTransactionPendingReferenceEvent.from({
            transactionId: transaction.id,
            providerId: transaction.providerId,
            externalTransactionId: transaction.externalTransactionId,
            walletId: transaction.walletId,
            playerId: transaction.playerId,
            roundId: transaction.roundId,
            gameId: transaction.gameId,
            kind: transaction.kind,
            money: transaction.money.toJSON(),
            referenceExternalTransactionId: transaction.referenceExternalTransactionId!,
            correlationId: randomUUID(),
          });

          const outbox = OutboxMessage.enqueue({
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payload: event.toJSON(),
          });
          await this.outboxRepository.save(outbox);

          return {
            transactionId: transaction.id,
            status: transaction.status,
          };
        }

        if (!transaction.isValidReference(reference)) {
          this.logger.warn(`Transaction ${transaction.id} rejected: invalid reference`);
          transaction.reject(FailureCode.INVALID_REFERENCE_KIND);
          await this.transactionRepository.save(transaction);
          await this.emitRejectedEvent(transaction);
          return {
            transactionId: transaction.id,
            status: transaction.status,
            failureCode: transaction.failureCode,
          };
        }

        if (!transaction.hasSameValueAs(reference)) {
          this.logger.warn(`Transaction ${transaction.id} rejected: reference value mismatch`);
          transaction.reject(FailureCode.REFERENCE_VALUE_MISMATCH);
          await this.transactionRepository.save(transaction);
          await this.emitRejectedEvent(transaction);
          return {
            transactionId: transaction.id,
            status: transaction.status,
            failureCode: transaction.failureCode,
          };
        }

        if (transaction.isReversal()) {
          const existingReversal = await this.findExistingReversal(
            reference.id,
            transaction.kind,
            transaction.walletId,
          );
          if (existingReversal) {
            this.logger.warn(`Transaction ${transaction.id} rejected: reference already reversed by ${existingReversal.id}`);
            transaction.reject(FailureCode.REFERENCE_ALREADY_REVERSED);
            await this.transactionRepository.save(transaction);
            await this.emitRejectedEvent(transaction);
            return {
              transactionId: transaction.id,
              status: transaction.status,
              failureCode: transaction.failureCode,
            };
          }
        }
      }

      if (transaction.kind === WagerTransactionKind.LOSS) {
        this.logger.log(`Transaction ${transaction.id} (LOSS) processed without balance change`);
        transaction.markProcessed(undefined, new Date());
        await this.transactionRepository.save(transaction);
        await this.emitProcessedEvent(transaction);
        return {
          transactionId: transaction.id,
          status: transaction.status,
          idempotentReplay: false,
        };
      }

      const direction = transaction.ledgerDirectionFor(reference);
      let entry: import('../../../wallet/domain/aggregates/wallet-ledger-entry').WalletLedgerEntry | undefined;

      const balanceBefore = wallet.balance.toJSON();

      if (direction === 'DEBIT') {
        try {
          entry = wallet.debit(transaction.money, transaction.id);
          this.logger.log(`Transaction ${transaction.id} debited ${transaction.money.toString()} from wallet ${props.walletId}`);
        } catch {
          this.logger.warn(`Transaction ${transaction.id} rejected: insufficient balance`);
          transaction.reject(FailureCode.INSUFFICIENT_BALANCE);
          await this.transactionRepository.save(transaction);
          await this.emitRejectedEvent(transaction);
          return {
            transactionId: transaction.id,
            status: transaction.status,
            failureCode: transaction.failureCode,
          };
        }
      } else if (direction === 'CREDIT') {
        entry = wallet.credit(transaction.money, transaction.id);
        this.logger.log(`Transaction ${transaction.id} credited ${transaction.money.toString()} to wallet ${props.walletId}`);
      }

      transaction.markProcessed(reference?.id, new Date());

      await this.transactionRepository.save(transaction);
      await this.walletRepository.save(wallet);
      if (entry) {
        await this.ledgerRepository.save(entry);
      }

      await this.emitProcessedEvent(transaction, entry);

      if (entry) {
        await this.emitBalanceChangedEvent(wallet.id, transaction.id, direction!, balanceBefore, wallet.balance.toJSON(), wallet.version);
      }

      this.logger.log(`Transaction ${transaction.id} processed successfully, new balance: ${wallet.balance.toString()}`);

      return {
        transactionId: transaction.id,
        status: transaction.status,
        balance: wallet.balance.toJSON(),
        idempotentReplay: false,
      };
    });
  }

  async processPendingReferences(limit: number = 50): Promise<number> {
    const pending = await this.transactionRepository.findPendingReferences(limit);
    let processed = 0;

    for (const tx of pending) {
      try {
        const reference = await this.transactionRepository.findByProviderAndExternalId(
          tx.providerId,
          tx.referenceExternalTransactionId!,
        );

        if (!reference || reference.status !== WagerTransactionStatus.PROCESSED) {
          if (tx.hasExceededMaxRetries?.()) {
            tx.reject(FailureCode.REFERENCE_NOT_FOUND);
            await this.transactionRepository.save(tx);
            await this.emitRejectedEvent(tx);
          }
          continue;
        }

        if (!tx.isValidReference(reference) || !tx.hasSameValueAs(reference)) {
          tx.reject(FailureCode.INVALID_REFERENCE_KIND);
          await this.transactionRepository.save(tx);
          await this.emitRejectedEvent(tx);
          processed++;
          continue;
        }

        const wallet = await this.walletRepository.findByIdForUpdate(tx.walletId);
        if (!wallet) {
          tx.fail(FailureCode.WALLET_NOT_FOUND);
          await this.transactionRepository.save(tx);
          processed++;
          continue;
        }

        const balanceBefore = wallet.balance.toJSON();
        const direction = tx.ledgerDirectionFor(reference);
        let entry;

        if (direction === 'DEBIT') {
          try {
            entry = wallet.debit(tx.money, tx.id);
          } catch {
            tx.reject(FailureCode.INSUFFICIENT_BALANCE);
            await this.transactionRepository.save(tx);
            await this.emitRejectedEvent(tx);
            processed++;
            continue;
          }
        } else if (direction === 'CREDIT') {
          entry = wallet.credit(tx.money, tx.id);
        }

        tx.markProcessed(reference.id, new Date());

        await this.transactionRepository.save(tx);
        await this.walletRepository.save(wallet);
        if (entry) {
          await this.ledgerRepository.save(entry);
        }

        await this.emitProcessedEvent(tx, entry);
        if (entry) {
          await this.emitBalanceChangedEvent(wallet.id, tx.id, direction!, balanceBefore, wallet.balance.toJSON(), wallet.version);
        }

        processed++;
      } catch (error) {
        this.logger.error(`Error processing pending reference ${tx.id}: ${error}`);
      }
    }

    return processed;
  }

  private async emitBalanceChangedEvent(
    walletId: string,
    transactionId: string,
    direction: 'DEBIT' | 'CREDIT',
    balanceBefore: { amount: string; currency: string },
    balanceAfter: { amount: string; currency: string },
    walletVersion: number,
  ) {
    const event = WalletBalanceChangedEvent.from({
      walletId,
      transactionId,
      direction,
      money: balanceAfter,
      balanceBefore,
      balanceAfter,
      walletVersion,
      correlationId: randomUUID(),
    });

    const outbox = OutboxMessage.enqueue({
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: event.toJSON(),
    });

    await this.outboxRepository.save(outbox);
    this.logger.debug(`WalletBalanceChanged event enqueued for wallet ${walletId}`);
  }

  private async emitProcessedEvent(transaction: WagerTransaction, entry?: import('../../../wallet/domain/aggregates/wallet-ledger-entry').WalletLedgerEntry) {
    const event = WagerTransactionProcessedEvent.from({
      transactionId: transaction.id,
      providerId: transaction.providerId,
      externalTransactionId: transaction.externalTransactionId,
      walletId: transaction.walletId,
      playerId: transaction.playerId,
      roundId: transaction.roundId,
      gameId: transaction.gameId,
      kind: transaction.kind,
      money: transaction.money.toJSON(),
      status: transaction.status,
      balanceAfter: entry ? entry.balanceAfter.toJSON() : undefined,
      correlationId: randomUUID(),
    });

    const outbox = OutboxMessage.enqueue({
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: event.toJSON(),
    });

    await this.outboxRepository.save(outbox);
    this.logger.debug(`Processed event enqueued for transaction ${transaction.id}`);
  }

  private async emitRejectedEvent(transaction: WagerTransaction) {
    const event = WagerTransactionRejectedEvent.from({
      transactionId: transaction.id,
      providerId: transaction.providerId,
      externalTransactionId: transaction.externalTransactionId,
      walletId: transaction.walletId,
      playerId: transaction.playerId,
      roundId: transaction.roundId,
      gameId: transaction.gameId,
      kind: transaction.kind,
      money: transaction.money.toJSON(),
      failureCode: transaction.failureCode!,
      reason: `Transaction rejected with code: ${transaction.failureCode}`,
      correlationId: randomUUID(),
    });

    const outbox = OutboxMessage.enqueue({
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: event.toJSON(),
    });

    await this.outboxRepository.save(outbox);
    this.logger.debug(`Rejected event enqueued for transaction ${transaction.id}`);
  }

  async findById(id: string) {
    this.logger.debug(`Finding transaction ${id}`);
    const transaction = await this.transactionRepository.findById(id);
    if (!transaction) {
      this.logger.warn(`Transaction not found: ${id}`);
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async findByProviderAndExternalId(providerId: string, externalTransactionId: string) {
    this.logger.debug(`Finding transaction by provider=${providerId} external=${externalTransactionId}`);
    const transaction = await this.transactionRepository.findByProviderAndExternalId(
      providerId,
      externalTransactionId,
    );
    if (!transaction) {
      this.logger.warn(`Transaction not found: provider=${providerId} external=${externalTransactionId}`);
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }
}
