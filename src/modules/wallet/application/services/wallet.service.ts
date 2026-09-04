import { Injectable, ConflictException, NotFoundException, Inject } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import Decimal from 'decimal.js';
import { Wallet } from '../../domain/aggregates/wallet';
import { WalletLedgerEntry, LedgerDirection } from '../../domain/aggregates/wallet-ledger-entry';
import { Money } from '../../domain/value-objects/money';
import { WalletRepository } from '../../infrastructure/persistence/repositories/wallet.repository';
import { LedgerRepository } from '../../infrastructure/persistence/repositories/ledger.repository';
import { randomUUID } from 'crypto';
import { WagerTransaction, WagerTransactionKind } from '../../../wagering/domain/aggregates/wager-transaction';
import { WagerTransactionEntity } from '../../../wagering/infrastructure/persistence/mikro-orm/entities/wager-transaction.entity';
import { OutboxMessage } from '../../../shared/domain/value-objects/outbox-message';
import { OutboxMessageEntity } from '../../../shared/infrastructure/persistence/mikro-orm/entities/outbox-message.entity';
import { StructuredLogger } from '../../../shared/infrastructure/logging/structured-logger';

@Injectable()
export class WalletService {
  private readonly logger = new StructuredLogger(WalletService.name);

  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly ledgerRepository: LedgerRepository,
    @Inject(EntityManager) private readonly em: EntityManager,
  ) {}

  async create(playerId: string, initialBalance: { amount: string; currency: string }): Promise<Wallet> {
    this.logger.log(`Creating wallet for player ${playerId} with ${initialBalance.amount} ${initialBalance.currency}`);
    const money = Money.from(initialBalance);

    return this.em.transactional(async () => {
      const existing = await this.walletRepository.findByPlayerAndCurrency(playerId, money.currency);
      if (existing) {
        this.logger.warn(`Wallet already exists for player ${playerId} with currency ${money.currency}`);
        throw new ConflictException('Wallet already exists for this player and currency');
      }

      const wallet = Wallet.open({
        id: randomUUID(),
        playerId,
        initialBalance: money,
      });

      await this.walletRepository.save(wallet);

      if (money.isPositive()) {
        const openingTransactionId = randomUUID();

        const entry = WalletLedgerEntry.create({
          walletId: wallet.id,
          transactionId: openingTransactionId,
          direction: LedgerDirection.CREDIT,
          money: money,
          balanceBefore: Money.zero(money.currency),
          balanceAfter: wallet.balance,
        });

        await this.ledgerRepository.save(entry);

        const openingTx = WagerTransaction.createOpening({
          id: openingTransactionId,
          walletId: wallet.id,
          playerId,
          money,
        });

        const txEntity = new WagerTransactionEntity({
          id: openingTx.id,
          providerId: openingTx.providerId,
          externalTransactionId: openingTx.externalTransactionId,
          idempotencyKey: openingTx.idempotencyKey,
          payloadHash: openingTx.payloadHash,
          walletId: openingTx.walletId,
          playerId: openingTx.playerId,
          roundId: openingTx.roundId,
          gameId: openingTx.gameId,
          kind: openingTx.kind,
          amount: openingTx.money.toAmountString(),
          currency: openingTx.money.currency,
          status: openingTx.status,
          processedAt: openingTx.processedAt,
        });
        await this.em.persist(txEntity);

        const outboxEvent = OutboxMessage.enqueue({
          aggregateId: wallet.id,
          eventType: 'WalletOpened',
          payload: {
            walletId: wallet.id,
            playerId,
            transactionId: openingTransactionId,
            amount: money.toAmountString(),
            currency: money.currency,
            kind: WagerTransactionKind.OPENING,
          },
        });

        const outboxEntity = new OutboxMessageEntity({
          id: outboxEvent.id,
          aggregateId: outboxEvent.aggregateId,
          eventType: outboxEvent.eventType,
          payload: { ...outboxEvent.payload },
          occurredAt: outboxEvent.occurredAt,
          attempts: outboxEvent.attempts,
          nextAttemptAt: outboxEvent.nextAttemptAt,
          publishedAt: outboxEvent.publishedAt,
        });
        await this.em.persist(outboxEntity);

        this.logger.log(`OPENING transaction + outbox event created for wallet ${wallet.id}`);
      }

      this.logger.log(`Wallet created: ${wallet.id} for player ${playerId}`);
      return wallet;
    });
  }

  async findById(id: string): Promise<Wallet> {
    this.logger.debug(`Finding wallet ${id}`);
    const wallet = await this.walletRepository.findById(id);
    if (!wallet) {
      this.logger.warn(`Wallet not found: ${id}`);
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  async getLedger(walletId: string, limit: number = 50, cursor?: string) {
    this.logger.debug(`Getting ledger for wallet ${walletId}, limit: ${limit}, cursor: ${cursor}`);
    await this.findById(walletId);
    return this.ledgerRepository.findByWalletId(walletId, limit, cursor);
  }

  async reconcile(walletId: string, body?: {
    storedBalance?: { amount: string; currency: string };
    calculatedBalance?: { amount: string; currency: string };
  }) {
    this.logger.log(`Reconciling wallet ${walletId}`);
    const wallet = await this.findById(walletId);
    const calculated = await this.ledgerRepository.calculateBalance(walletId);
    const stored = wallet.balance.toJSON();

    const consistent =
      calculated.amount === stored.amount &&
      calculated.currency === stored.currency;

    const diffAmount = new Decimal(stored.amount).minus(calculated.amount).toFixed(2);

    if (!consistent) {
      this.logger.warn(`Wallet ${walletId} inconsistent: stored=${stored.amount} calculated=${calculated.amount} diff=${diffAmount}`);
    } else {
      this.logger.log(`Wallet ${walletId} consistent, balance: ${stored.amount} ${stored.currency}`);
    }

    const result: Record<string, unknown> = {
      walletId,
      storedBalance: stored,
      calculatedBalance: calculated,
      difference: {
        amount: consistent ? '0.00' : diffAmount,
        currency: stored.currency,
      },
      consistent,
      checkedEntries: await this.ledgerRepository.countByWalletId(walletId),
    };

    if (body?.storedBalance && body?.calculatedBalance) {
      const callerDiff = new Decimal(body.storedBalance.amount).minus(body.calculatedBalance.amount);
      const callerDiffStr = callerDiff.toFixed(2);
      result.callerVerification = {
        callerStoredBalance: body.storedBalance,
        callerCalculatedBalance: body.calculatedBalance,
        callerDifference: {
          amount: callerDiffStr,
          currency: body.storedBalance.currency,
        },
        callerConsistent: callerDiff.isZero() && body.storedBalance.amount === stored.amount,
      };
    }

    return result;
  }
}
