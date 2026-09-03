import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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
import { randomUUID, createHash } from 'crypto';

@Injectable()
export class TransactionService {
  constructor(
    private readonly transactionRepository: WagerTransactionRepository,
    private readonly walletRepository: WalletRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly outboxRepository: OutboxRepository,
  ) {}

  private hashPayload(props: Record<string, unknown>): string {
    const json = JSON.stringify(props);
    return createHash('sha256').update(json).digest('hex');
  }

  private async getBalance(walletId: string) {
    const wallet = await this.walletRepository.findById(walletId);
    return wallet?.balance.toJSON();
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
    const existing = await this.transactionRepository.findByIdempotencyKey(props.idempotencyKey);
    if (existing) {
      return {
        transactionId: existing.id,
        status: existing.status,
        balance: existing.affectsBalance() ? await this.getBalance(existing.walletId) : undefined,
        idempotentReplay: true,
      };
    }

    const wallet = await this.walletRepository.findById(props.walletId);
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (wallet.playerId !== props.playerId) {
      throw new ConflictException('Player does not own this wallet');
    }

    if (wallet.currency !== props.money.currency) {
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
      reference = await this.transactionRepository.findByProviderAndExternalId(
        props.providerId,
        props.referenceExternalTransactionId!,
      ) ?? undefined;

      if (!reference || reference.status !== WagerTransactionStatus.PROCESSED) {
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
        transaction.reject(FailureCode.REFERENCE_VALUE_MISMATCH);
        await this.transactionRepository.save(transaction);
        await this.emitRejectedEvent(transaction);
        return {
          transactionId: transaction.id,
          status: transaction.status,
          failureCode: transaction.failureCode,
        };
      }
    }

    if (transaction.kind === WagerTransactionKind.LOSS) {
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

    if (direction === 'DEBIT') {
      try {
        entry = wallet.debit(transaction.money, transaction.id);
      } catch {
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
    }

    transaction.markProcessed(reference?.id, new Date());

    await this.transactionRepository.save(transaction);
    await this.walletRepository.save(wallet);
    if (entry) {
      await this.ledgerRepository.save(entry);
    }

    await this.emitProcessedEvent(transaction, entry);

    return {
      transactionId: transaction.id,
      status: transaction.status,
      balance: wallet.balance.toJSON(),
      idempotentReplay: false,
    };
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
  }

  async findById(id: string) {
    const transaction = await this.transactionRepository.findById(id);
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async findByProviderAndExternalId(providerId: string, externalTransactionId: string) {
    const transaction = await this.transactionRepository.findByProviderAndExternalId(
      providerId,
      externalTransactionId,
    );
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }
}
