import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { Wallet } from '../../../domain/aggregates/wallet';
import { WalletEntity } from '../mikro-orm/entities/wallet.entity';
import { WalletRepositoryPort } from '../../../domain/repositories/wallet.repository.port';

export class WalletRepository implements WalletRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  private toEntity(wallet: Wallet): WalletEntity {
    return new WalletEntity({
      id: wallet.id,
      playerId: wallet.playerId,
      currency: wallet.currency,
      balance: wallet.balance.toAmountString(),
      version: wallet.version,
    });
  }

  private toDomain(entity: WalletEntity): Wallet {
    return Wallet.rehydrate({
      id: entity.id,
      playerId: entity.playerId,
      currency: entity.currency,
      balance: {
        amount: entity.balance,
        currency: entity.currency,
      },
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  async save(wallet: Wallet): Promise<void> {
    const entity = this.toEntity(wallet);
    const managed = await this.em.findOne(WalletEntity, { id: wallet.id });
    if (managed) {
      managed.updateBalance(wallet.balance.toAmountString(), wallet.version);
      await this.em.flush();
    } else {
      await this.em.persist(entity).flush();
    }
  }

  async findById(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity, { id });
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async findByPlayerAndCurrency(
    playerId: string,
    currency: string,
  ): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity, {
      playerId,
      currency,
    });
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async findByIdForUpdate(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(
      WalletEntity,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async exists(playerId: string, currency: string): Promise<boolean> {
    const count = await this.em.count(WalletEntity, {
      playerId,
      currency,
    });
    return count > 0;
  }

  async delete(id: string): Promise<void> {
    const entity = await this.em.findOne(WalletEntity, { id });
    if (entity) {
      await this.em.remove(entity).flush();
    }
  }
}
