import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Wallet } from '../../domain/aggregates/wallet';
import { Money } from '../../domain/value-objects/money';
import { WalletRepository } from '../../infrastructure/persistence/repositories/wallet.repository';
import { LedgerRepository } from '../../infrastructure/persistence/repositories/ledger.repository';
import { randomUUID } from 'crypto';

@Injectable()
export class WalletService {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly ledgerRepository: LedgerRepository,
  ) {}

  async create(playerId: string, initialBalance: { amount: string; currency: string }): Promise<Wallet> {
    const money = Money.from(initialBalance);

    const existing = await this.walletRepository.findByPlayerAndCurrency(playerId, money.currency);
    if (existing) {
      throw new ConflictException('Wallet already exists for this player and currency');
    }

    const wallet = Wallet.open({
      id: randomUUID(),
      playerId,
      initialBalance: money,
    });

    await this.walletRepository.save(wallet);
    return wallet;
  }

  async findById(id: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findById(id);
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  async getLedger(walletId: string, limit: number = 50, cursor?: string) {
    await this.findById(walletId);
    return this.ledgerRepository.findByWalletId(walletId, limit, cursor);
  }

  async reconcile(walletId: string) {
    const wallet = await this.findById(walletId);
    const calculated = await this.ledgerRepository.calculateBalance(walletId);
    const stored = wallet.balance.toJSON();

    const consistent =
      calculated.amount === stored.amount &&
      calculated.currency === stored.currency;

    const diffAmount = (parseFloat(stored.amount) - parseFloat(calculated.amount)).toFixed(2);

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
