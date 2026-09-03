import { defineEntity, p } from '@mikro-orm/core';

/**
 * OutboxMessageEntitySchema - Definição da entidade OutboxMessage para MikroORM v7
 *
 * INVARIANTES NO BANCO:
 * - attempts >= 0 (CHECK)
 * - publishedAt nullable - mensagens não publicadas têm null
 * - Índices em publishedAt e nextAttemptAt para consultas eficientes
 *
 * DECISÕES DE DESIGN:
 * 1. ID é UUID gerado no domínio
 * 2. payload é JSONB para flexibilidade
 * 3. attempts rastreia número de tentativas
 * 4. nextAttemptAt para backoff exponencial
 * 5. publishedAt definido quando publicada com sucesso
 */
const OutboxMessageEntitySchema = defineEntity({
  name: 'OutboxMessageEntity',
  tableName: 'outbox_messages',
  properties: {
    id: () => p.uuid().primary(),
    aggregateId: () => p.uuid().index(),
    eventType: () => p.string().index(),
    payload: () => p.json(),
    occurredAt: () => p.datetime(),
    attempts: () => p.integer().default(0).check('attempts >= 0'),
    nextAttemptAt: () => p.datetime().nullable().index(),
    publishedAt: () => p.datetime().nullable().index(),
  },
});

/**
 * OutboxMessageEntity - Classe da entidade
 */
export class OutboxMessageEntity extends OutboxMessageEntitySchema.class {
  constructor(props: {
    id: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    occurredAt?: Date;
    attempts?: number;
    nextAttemptAt?: Date;
    publishedAt?: Date;
  }) {
    super();
    this.id = props.id;
    this.aggregateId = props.aggregateId;
    this.eventType = props.eventType;
    this.payload = props.payload;
    this.occurredAt = props.occurredAt || new Date();
    this.attempts = props.attempts || 0;
    this.nextAttemptAt = props.nextAttemptAt;
    this.publishedAt = props.publishedAt;
  }

  markPublished(at: Date): void {
    this.publishedAt = at;
  }

  scheduleRetry(now: Date): void {
    this.attempts += 1;
    const delay = Math.pow(2, this.attempts) * 1000;
    this.nextAttemptAt = new Date(now.getTime() + delay);
  }

  isPending(): boolean {
    return this.publishedAt == null;
  }

  isDue(now: Date): boolean {
    if (!this.isPending()) return false;
    if (this.nextAttemptAt == null) return true;
    return this.nextAttemptAt <= now;
  }

  hasExceededMaxAttempts(maxAttempts: number = 10): boolean {
    return this.attempts >= maxAttempts;
  }
}

OutboxMessageEntitySchema.setClass(OutboxMessageEntity);

export { OutboxMessageEntitySchema };
