import { EntityManager } from '@mikro-orm/postgresql';
import { WagerTransaction } from '../../../domain/aggregates/wager-transaction';
import { WagerTransactionEntity } from '../mikro-orm/entities/wager-transaction.entity';
import { WagerTransactionRepositoryPort } from '../../../domain/repositories/wager-transaction.repository.port';

/**
 * WagerTransactionRepository - Implementação do repositório de WagerTransaction
 *
 * Converte entre Domain (WagerTransaction) e Infrastructure (WagerTransactionEntity)
 */
export class WagerTransactionRepository implements WagerTransactionRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  private toEntity(transaction: WagerTransaction): WagerTransactionEntity {
    return new WagerTransactionEntity({
      id: transaction.id,
      providerId: transaction.providerId,
      externalTransactionId: transaction.externalTransactionId,
      idempotencyKey: transaction.idempotencyKey,
      payloadHash: transaction.payloadHash,
      walletId: transaction.walletId,
      playerId: transaction.playerId,
      roundId: transaction.roundId,
      gameId: transaction.gameId,
      kind: transaction.kind,
      amount: transaction.money.toAmountString(),
      currency: transaction.money.currency,
      referenceExternalTransactionId: transaction.referenceExternalTransactionId,
      status: transaction.status,
      referenceTransactionId: transaction.referenceTransactionId,
      failureCode: transaction.failureCode,
      processedAt: transaction.processedAt,
    });
  }

  private toDomain(entity: WagerTransactionEntity): WagerTransaction {
    return WagerTransaction.rehydrate({
      id: entity.id,
      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,
      walletId: entity.walletId,
      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,
      kind: entity.kind as WagerTransaction['kind'],
      money: {
        amount: entity.amount,
        currency: entity.currency,
      },
      referenceExternalTransactionId: entity.referenceExternalTransactionId ?? undefined,
      createdAt: entity.createdAt,
      status: entity.status as WagerTransaction['status'],
      referenceTransactionId: entity.referenceTransactionId ?? undefined,
      failureCode: (entity.failureCode as WagerTransaction['failureCode']) ?? undefined,
      processedAt: entity.processedAt ?? undefined,
    });
  }

  async save(transaction: WagerTransaction): Promise<void> {
    const entity = this.toEntity(transaction);
    await this.em.persist(entity).flush();
  }

  async saveMany(transactions: WagerTransaction[]): Promise<void> {
    const entities = transactions.map((t) => this.toEntity(t));
    await this.em.persist(entities).flush();
  }

  async findById(id: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, { id });
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, { idempotencyKey });
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, {
      providerId,
      externalTransactionId,
    });
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async findByWalletId(
    walletId: string,
    limit: number = 50,
    cursor?: string,
  ): Promise<{ transactions: WagerTransaction[]; nextCursor?: string }> {
    const query = { walletId };

    let entities: WagerTransactionEntity[];

    if (cursor) {
      const cursorEntity = await this.em.findOne(WagerTransactionEntity, { id: cursor });
      if (cursorEntity) {
        entities = await this.em.find(
          WagerTransactionEntity,
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
          WagerTransactionEntity,
          query,
          {
            orderBy: { createdAt: 'DESC' },
            limit: limit + 1,
          },
        );
      }
    } else {
      entities = await this.em.find(
        WagerTransactionEntity,
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
      transactions: result.map((entity) => this.toDomain(entity)),
      nextCursor: hasNext ? result[result.length - 1].id : undefined,
    };
  }

  async findByStatus(status: string, limit: number = 100): Promise<WagerTransaction[]> {
    const entities = await this.em.find(
      WagerTransactionEntity,
      { status },
      {
        orderBy: { createdAt: 'ASC' },
        limit,
      },
    );
    return entities.map((entity) => this.toDomain(entity));
  }

  async findPendingReferences(limit: number = 100): Promise<WagerTransaction[]> {
    return this.findByStatus('PENDING_REFERENCE', limit);
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const entity = await this.em.findOne(WagerTransactionEntity, { id });
    if (entity) {
      entity.updateStatus(status);
      await this.em.flush();
    }
  }

  async existsByIdempotencyKey(idempotencyKey: string): Promise<boolean> {
    const count = await this.em.count(WagerTransactionEntity, { idempotencyKey });
    return count > 0;
  }
}
