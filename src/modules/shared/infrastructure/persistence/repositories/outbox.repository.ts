import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { OutboxMessage } from '../../../domain/value-objects/outbox-message';
import { OutboxMessageEntity } from '../mikro-orm/entities/outbox-message.entity';
import { OutboxRepositoryPort } from '../../../domain/repositories/outbox.repository.port';

@Injectable()
export class OutboxRepository implements OutboxRepositoryPort {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  private toEntity(message: OutboxMessage): OutboxMessageEntity {
    return new OutboxMessageEntity({
      id: message.id,
      aggregateId: message.aggregateId,
      eventType: message.eventType,
      payload: { ...message.payload },
      occurredAt: message.occurredAt,
      attempts: message.attempts,
      nextAttemptAt: message.nextAttemptAt,
      publishedAt: message.publishedAt,
    });
  }

  private toDomain(entity: OutboxMessageEntity): OutboxMessage {
    return OutboxMessage.rehydrate({
      id: entity.id,
      aggregateId: entity.aggregateId,
      eventType: entity.eventType,
      payload: entity.payload as Readonly<Record<string, unknown>>,
      occurredAt: entity.occurredAt,
      attempts: entity.attempts,
      nextAttemptAt: entity.nextAttemptAt ?? undefined,
      publishedAt: entity.publishedAt ?? undefined,
    });
  }

  async save(message: OutboxMessage): Promise<void> {
    const entity = this.toEntity(message);
    await this.em.persist(entity).flush();
  }

  async saveMany(messages: OutboxMessage[]): Promise<void> {
    const entities = messages.map((m) => this.toEntity(m));
    await this.em.persist(entities).flush();
  }

  async findById(id: string): Promise<OutboxMessage | null> {
    const entity = await this.em.findOne(OutboxMessageEntity, { id });
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async findPendingDue(limit: number = 100): Promise<OutboxMessage[]> {
    const now = new Date();

    const entities = await this.em.find(
      OutboxMessageEntity,
      {
        publishedAt: null,
        $or: [
          { nextAttemptAt: null },
          { nextAttemptAt: { $lte: now } },
        ],
      },
      {
        orderBy: { occurredAt: 'ASC' },
        limit,
      },
    );

    return entities.map((entity) => this.toDomain(entity));
  }

  async findPendingByAggregateId(aggregateId: string): Promise<OutboxMessage[]> {
    const entities = await this.em.find(
      OutboxMessageEntity,
      {
        aggregateId,
        publishedAt: null,
      },
      {
        orderBy: { occurredAt: 'ASC' },
      },
    );

    return entities.map((entity) => this.toDomain(entity));
  }

  async markPublished(id: string, at: Date): Promise<void> {
    const entity = await this.em.findOne(OutboxMessageEntity, { id });
    if (entity) {
      entity.markPublished(at);
      await this.em.flush();
    }
  }

  async scheduleRetry(id: string, now: Date): Promise<void> {
    const entity = await this.em.findOne(OutboxMessageEntity, { id });
    if (entity) {
      entity.scheduleRetry(now);
      await this.em.flush();
    }
  }

  async countPending(): Promise<number> {
    return await this.em.count(OutboxMessageEntity, {
      publishedAt: null,
    });
  }

  async countPendingDue(before?: Date): Promise<number> {
    const now = before || new Date();

    return await this.em.count(OutboxMessageEntity, {
      publishedAt: null,
      $or: [
        { nextAttemptAt: null },
        { nextAttemptAt: { $lte: now } },
      ],
    });
  }

  async deletePublishedBefore(before: Date): Promise<number> {
    const result = await this.em.nativeDelete(OutboxMessageEntity, {
      publishedAt: { $lt: before },
    });
    return result;
  }

  async findExceededMaxAttempts(
    maxAttempts: number = 10,
    limit: number = 100,
  ): Promise<OutboxMessage[]> {
    const entities = await this.em.find(
      OutboxMessageEntity,
      {
        publishedAt: null,
        attempts: { $gte: maxAttempts },
      },
      {
        orderBy: { occurredAt: 'ASC' },
        limit,
      },
    );

    return entities.map((entity) => this.toDomain(entity));
  }
}
