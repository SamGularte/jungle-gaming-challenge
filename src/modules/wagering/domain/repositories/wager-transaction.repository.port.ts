import { WagerTransaction } from '../aggregates/wager-transaction';

/**
 * WagerTransactionRepositoryPort - Interface do repositório de WagerTransaction
 *
 * Define as operações que o repositório deve suportar.
 * Esta interface está no DOMÍNIO, a implementação está na INFRAESTRUTURA.
 *
 * DECISÕES DE DESIGN:
 * 1. O domínio NÃO conhece MikroORM
 * 2. Métodos específicos para regras de negócio (idempotência, referências)
 * 3. Busca por provedor + externalId para validação de referências
 * 4. Busca por status para reprocessamento
 */
export interface WagerTransactionRepositoryPort {
  save(transaction: WagerTransaction): Promise<void>;
  saveMany(transactions: WagerTransaction[]): Promise<void>;
  findById(id: string): Promise<WagerTransaction | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<WagerTransaction | null>;
  findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null>;
  findByReferenceTransactionId(referenceTransactionId: string): Promise<WagerTransaction[]>;
  findByWalletId(
    walletId: string,
    limit?: number,
    cursor?: string,
  ): Promise<{ transactions: WagerTransaction[]; nextCursor?: string }>;
  findByStatus(status: string, limit?: number): Promise<WagerTransaction[]>;
  findPendingReferences(limit?: number): Promise<WagerTransaction[]>;
  updateStatus(id: string, status: string): Promise<void>;
  existsByIdempotencyKey(idempotencyKey: string): Promise<boolean>;
}
