import { defineEntity, p } from '@mikro-orm/core';

/**
 * WagerTransactionEntitySchema - Definição da entidade WagerTransaction para MikroORM v7
 *
 * INVARIANTES NO BANCO:
 * - idempotencyKey UNIQUE - garante idempotência
 * - (providerId, externalTransactionId) UNIQUE - evita duplicatas por provedor
 * - kind deve ser OPENING, BET, WIN, LOSS, REFUND ou ROLLBACK (CHECK)
 * - status deve ser PENDING, PENDING_REFERENCE, PROCESSED, REJECTED ou FAILED (CHECK)
 * - currency deve ser BRL, USD ou EUR (CHECK)
 *
 * DECISÕES DE DESIGN:
 * 1. Índices em walletId e playerId para consultas rápidas
 * 2. Índice em status para filas de reprocessamento
 * 3. versionamento de eventos via status
 * 4. FK para wallet (walletId) - referência à tabela wallets
 */
const WagerTransactionEntitySchema = defineEntity({
  name: 'WagerTransactionEntity',
  tableName: 'wager_transactions',
  properties: {
    id: () => p.uuid().primary(),
    providerId: () => p.string().index(),
    externalTransactionId: () => p.string().index(),
    idempotencyKey: () => p.string().unique(),
    payloadHash: () => p.string().length(64),
    walletId: () => p.uuid().index(),
    playerId: () => p.uuid().index(),
    roundId: () => p.string().index(),
    gameId: () => p.string(),
    kind: () => p.string().length(20).check("kind IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')"),
    amount: () => p.decimal('string').precision(20).scale(2),
    currency: () => p.string().length(3).check("currency IN ('BRL', 'USD', 'EUR')"),
    referenceExternalTransactionId: () => p.string().nullable(),
    createdAt: () => p.datetime(),
    status: () => p.string().length(20).check("status IN ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED')"),
    referenceTransactionId: () => p.uuid().nullable(),
    failureCode: () => p.string().nullable(),
    processedAt: () => p.datetime().nullable(),
    retryCount: () => p.integer().default(0),
    pendingReferenceExpiresAt: () => p.datetime().nullable(),
  },
  uniques: [
    { properties: ['providerId', 'externalTransactionId'] },
  ],
});

/**
 * WagerTransactionEntity - Classe da entidade
 */
export class WagerTransactionEntity extends WagerTransactionEntitySchema.class {
  constructor(props: {
    id: string;
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: string;
    amount: string;
    currency: string;
    referenceExternalTransactionId?: string;
    status: string;
    referenceTransactionId?: string;
    failureCode?: string;
    processedAt?: Date;
    retryCount?: number;
    pendingReferenceExpiresAt?: Date;
  }) {
    super();
    this.id = props.id;
    this.providerId = props.providerId;
    this.externalTransactionId = props.externalTransactionId;
    this.idempotencyKey = props.idempotencyKey;
    this.payloadHash = props.payloadHash;
    this.walletId = props.walletId;
    this.playerId = props.playerId;
    this.roundId = props.roundId;
    this.gameId = props.gameId;
    this.kind = props.kind;
    this.amount = props.amount;
    this.currency = props.currency;
    this.referenceExternalTransactionId = props.referenceExternalTransactionId;
    this.createdAt = new Date();
    this.status = props.status;
    this.referenceTransactionId = props.referenceTransactionId;
    this.failureCode = props.failureCode;
    this.processedAt = props.processedAt;
    this.retryCount = props.retryCount ?? 0;
    this.pendingReferenceExpiresAt = props.pendingReferenceExpiresAt;
  }

  updateStatus(newStatus: string): void {
    this.status = newStatus;
  }

  markProcessed(referenceTransactionId: string | undefined, processedAt: Date): void {
    this.status = 'PROCESSED';
    this.referenceTransactionId = referenceTransactionId;
    this.processedAt = processedAt;
  }

  markRejected(failureCode: string, processedAt: Date): void {
    this.status = 'REJECTED';
    this.failureCode = failureCode;
    this.processedAt = processedAt;
  }

  markFailed(failureCode: string, processedAt: Date): void {
    this.status = 'FAILED';
    this.failureCode = failureCode;
    this.processedAt = processedAt;
  }

  markPendingReference(): void {
    this.status = 'PENDING_REFERENCE';
  }
}

WagerTransactionEntitySchema.setClass(WagerTransactionEntity);

export { WagerTransactionEntitySchema };
