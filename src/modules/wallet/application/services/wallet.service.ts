import { Injectable, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Wallet } from '../../domain/aggregates/wallet';
import { WalletLedgerEntry, LedgerDirection } from '../../domain/aggregates/wallet-ledger-entry';
import { Money } from '../../domain/value-objects/money';
import { WalletRepository } from '../../infrastructure/persistence/repositories/wallet.repository';
import { LedgerRepository } from '../../infrastructure/persistence/repositories/ledger.repository';
import { randomUUID } from 'crypto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly ledgerRepository: LedgerRepository,
  ) {}

  async create(playerId: string, initialBalance: { amount: string; currency: string }): Promise<Wallet> {
    this.logger.log(`Creating wallet for player ${playerId} with ${initialBalance.amount} ${initialBalance.currency}`);
    const money = Money.from(initialBalance);

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
      const balanceAfter = wallet.balance.toJSON();
      const balanceBefore = Money.zero(money.currency).toJSON();

      const entry = WalletLedgerEntry.create({
        walletId: wallet.id,
        transactionId: openingTransactionId,
        direction: LedgerDirection.CREDIT,
        money: money,
        balanceBefore: Money.zero(money.currency),
        balanceAfter: wallet.balance,
      });

      await this.ledgerRepository.save(entry);
      this.logger.log(`OPENING transaction created for wallet ${wallet.id}, credit ${money.toString()}`);
    }

    this.logger.log(`Wallet created: ${wallet.id} for player ${playerId}`);
    return wallet;
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

  async reconcile(walletId: string) {
    this.logger.log(`Reconciling wallet ${walletId}`);
    const wallet = await this.findById(walletId);
    const calculated = await this.ledgerRepository.calculateBalance(walletId);
    const stored = wallet.balance.toJSON();

    const consistent =
      calculated.amount === stored.amount &&
      calculated.currency === stored.currency;

    const diffAmount = (parseFloat(stored.amount) - parseFloat(calculated.amount)).toFixed(2);

    if (!consistent) {
      this.logger.warn(`Wallet ${walletId} inconsistent: stored=${stored.amount} calculated=${calculated.amount} diff=${diffAmount}`);
    } else {
      this.logger.log(`Wallet ${walletId} consistent, balance: ${stored.amount} ${stored.currency}`);
    }

    return {
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
  }
}
