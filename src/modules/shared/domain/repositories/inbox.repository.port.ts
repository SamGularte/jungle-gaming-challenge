import { InboxMessage } from '../../domain/value-objects/inbox-message';

/**
 * InboxRepositoryPort - Interface do repositório de Inbox
 *
 * Define as operações que o repositório deve suportar.
 * Esta interface está no DOMÍNIO, a implementação está na INFRAESTRUTURA.
 *
 * DECISÕES DE DESIGN:
 * 1. O domínio NÃO conhece MikroORM
 * 2. Deduplicação persistente via (consumerName, messageId)
 * 3. Método específico para verificar se mensagem já foi processada
 * 4. Busca por consumerName para processamento em lote
 */
export interface InboxRepositoryPort {
  save(message: InboxMessage): Promise<void>;
  findByConsumerAndMessageId(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | null>;
  isProcessed(consumerName: string, messageId: string): Promise<boolean>;
  exists(consumerName: string, messageId: string): Promise<boolean>;
  findUnprocessedByConsumer(
    consumerName: string,
    limit?: number,
  ): Promise<InboxMessage[]>;
  markProcessed(
    consumerName: string,
    messageId: string,
    at: Date,
  ): Promise<void>;
  countUnprocessed(consumerName: string): Promise<number>;
  deleteProcessedBefore(before: Date): Promise<number>;
}
