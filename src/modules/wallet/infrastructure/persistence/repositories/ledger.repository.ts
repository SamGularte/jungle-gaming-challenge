import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { WalletLedgerEntry, LedgerDirection } from '../../../domain/aggregates/wallet-ledger-entry';
import { LedgerEntryEntity } from '../mikro-orm/entities/ledger-entry.entity';
import { LedgerRepositoryPort } from '../../../domain/repositories/ledger.repository.port';

@Injectable()
export class LedgerRepository implements LedgerRepositoryPort {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  // ============================================
  // CONVERSORES
  // ============================================

  /**
   * Converte Domain → Entity (MikroORM)
   */
  private toEntity(entry: WalletLedgerEntry): LedgerEntryEntity {
    return new LedgerEntryEntity({
      id: entry.id,
      walletId: entry.walletId,
      transactionId: entry.transactionId,
      direction: entry.direction,
      amount: entry.money.toAmountString(),
      currency: entry.money.currency,
      balanceBefore: entry.balanceBefore.toAmountString(),
      balanceAfter: entry.balanceAfter.toAmountString(),
    });
  }

  /**
   * Converte Entity (MikroORM) → Domain
   */
  private toDomain(entity: LedgerEntryEntity): WalletLedgerEntry {
    return WalletLedgerEntry.rehydrate({
      id: entity.id,
      walletId: entity.walletId,
      transactionId: entity.transactionId,
      direction: entity.direction as LedgerDirection,
      money: {
        amount: entity.amount,
        currency: entity.currency,
      },
      balanceBefore: {
        amount: entity.balanceBefore,
        currency: entity.currency,
      },
      balanceAfter: {
        amount: entity.balanceAfter,
        currency: entity.currency,
      },
      createdAt: entity.createdAt,
    });
  }

  // ============================================
  // MÉTODOS DO REPOSITÓRIO
  // ============================================

  async save(entry: WalletLedgerEntry): Promise<void> {
    const entity = this.toEntity(entry);
    await this.em.persist(entity).flush();
  }

  async saveMany(entries: WalletLedgerEntry[]): Promise<void> {
    const entities = entries.map((entry) => this.toEntity(entry));
    await this.em.persist(entities).flush();
  }

  async findByWalletId(
    walletId: string,
    limit: number = 50,
    cursor?: string,
  ): Promise<{ entries: WalletLedgerEntry[]; nextCursor?: string }> {
    const query = { walletId };

    let entities: LedgerEntryEntity[];

    if (cursor) {
      const cursorEntity = await this.em.findOne(LedgerEntryEntity, { id: cursor });
      if (cursorEntity) {
        entities = await this.em.find(
          LedgerEntryEntity,
          {
            ...query,
            createdAt: { $lt: cursorEntity.createdAt },
          },
          {
            orderBy: { createdAt: 'DESC' },
            limit: limit + 1,
          },
        );
      } else {
        entities = await this.em.find(
          LedgerEntryEntity,
          query,
          {
            orderBy: { createdAt: 'DESC' },
            limit: limit + 1,
          },
        );
      }
    } else {
      entities = await this.em.find(
        LedgerEntryEntity,
        query,
        {
          orderBy: { createdAt: 'DESC' },
          limit: limit + 1,
        },
      );
    }

    const hasNext = entities.length > limit;
    const result = entities.slice(0, limit);

    return {
      entries: result.map((entity) => this.toDomain(entity)),
      nextCursor: hasNext ? result[result.length - 1].id : undefined,
    };
  }

  async findByTransactionId(transactionId: string): Promise<WalletLedgerEntry | null> {
    const entity = await this.em.findOne(LedgerEntryEntity, { transactionId });
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async findLastByWalletId(walletId: string): Promise<WalletLedgerEntry | null> {
    const entity = await this.em.findOne(
      LedgerEntryEntity,
      { walletId },
      { orderBy: { createdAt: 'DESC' } },
    );
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async calculateBalance(walletId: string): Promise<{ amount: string; currency: string }> {
    const entries = await this.em.find(
      LedgerEntryEntity,
      { walletId },
      { orderBy: { createdAt: 'ASC' } },
    );

    if (entries.length === 0) {
      return { amount: '0.00', currency: 'BRL' };
    }

    const lastEntry = entries[entries.length - 1];
    return {
      amount: lastEntry.balanceAfter,
      currency: lastEntry.currency,
    };
  }

  async countByWalletId(walletId: string): Promise<number> {
    return await this.em.count(LedgerEntryEntity, { walletId });
  }
}
