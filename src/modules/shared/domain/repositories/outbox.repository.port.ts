import { OutboxMessage } from '../../domain/value-objects/outbox-message';

/**
 * OutboxRepositoryPort - Interface do repositório de Outbox
 *
 * Define as operações que o repositório deve suportar.
 * Esta interface está no DOMÍNIO, a implementação está na INFRAESTRUTURA.
 *
 * DECISÕES DE DESIGN:
 * 1. O domínio NÃO conhece MikroORM
 * 2. Busca mensagens pendentes para publicação
 * 3. Busca mensagens prontas para retry
 * 4. Múltiplos publishers concorrentes (segurança via banco)
 */
export interface OutboxRepositoryPort {
  save(message: OutboxMessage): Promise<void>;
  saveMany(messages: OutboxMessage[]): Promise<void>;
  findById(id: string): Promise<OutboxMessage | null>;
  findPendingDue(limit?: number): Promise<OutboxMessage[]>;
  findPendingByAggregateId(aggregateId: string): Promise<OutboxMessage[]>;
  markPublished(id: string, at: Date): Promise<void>;
  scheduleRetry(id: string, now: Date): Promise<void>;
  countPending(): Promise<number>;
  countPendingDue(before?: Date): Promise<number>;
  deletePublishedBefore(before: Date): Promise<number>;
  findExceededMaxAttempts(maxAttempts?: number, limit?: number): Promise<OutboxMessage[]>;
}
