import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { InboxMessage } from '../../../domain/value-objects/inbox-message';
import { InboxMessageEntity } from '../mikro-orm/entities/inbox-message.entity';
import { InboxRepositoryPort } from '../../../domain/repositories/inbox.repository.port';

@Injectable()
export class InboxRepository implements InboxRepositoryPort {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  private toEntity(message: InboxMessage): InboxMessageEntity {
    return new InboxMessageEntity({
      messageId: message.messageId,
      consumerName: message.consumerName,
      payloadHash: message.payloadHash,
      receivedAt: message.receivedAt,
      processedAt: message.processedAt,
    });
  }

  private toDomain(entity: InboxMessageEntity): InboxMessage {
    return InboxMessage.rehydrate({
      messageId: entity.messageId,
      consumerName: entity.consumerName,
      payloadHash: entity.payloadHash,
      receivedAt: entity.receivedAt,
      processedAt: entity.processedAt ?? undefined,
    });
  }

  async save(message: InboxMessage): Promise<void> {
    await this.em.upsert(InboxMessageEntity, {
      messageId: message.messageId,
      consumerName: message.consumerName,
      payloadHash: message.payloadHash,
      receivedAt: message.receivedAt,
      processedAt: message.processedAt ?? null,
    });
  }

  async findByConsumerAndMessageId(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | null> {
    const entity = await this.em.findOne(InboxMessageEntity, {
      consumerName,
      messageId,
    });
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async isProcessed(consumerName: string, messageId: string): Promise<boolean> {
    const entity = await this.em.findOne(InboxMessageEntity, {
      consumerName,
      messageId,
    });
    if (!entity) return false;
    return entity.processedAt !== null;
  }

  async exists(consumerName: string, messageId: string): Promise<boolean> {
    const count = await this.em.count(InboxMessageEntity, {
      consumerName,
      messageId,
    });
    return count > 0;
  }

  async findUnprocessedByConsumer(
    consumerName: string,
    limit: number = 100,
  ): Promise<InboxMessage[]> {
    const entities = await this.em.find(
      InboxMessageEntity,
      {
        consumerName,
        processedAt: null,
      },
      {
        orderBy: { receivedAt: 'ASC' },
        limit,
      },
    );
    return entities.map((entity) => this.toDomain(entity));
  }

  async markProcessed(
    consumerName: string,
    messageId: string,
    at: Date,
  ): Promise<void> {
    const entity = await this.em.findOne(InboxMessageEntity, {
      consumerName,
      messageId,
    });
    if (entity) {
      entity.markProcessed(at);
      await this.em.flush();
    }
  }

  async countUnprocessed(consumerName: string): Promise<number> {
    return await this.em.count(InboxMessageEntity, {
      consumerName,
      processedAt: null,
    });
  }

  async deleteProcessedBefore(before: Date): Promise<number> {
    const result = await this.em.nativeDelete(InboxMessageEntity, {
      processedAt: { $lt: before },
    });
    return result;
  }
}
