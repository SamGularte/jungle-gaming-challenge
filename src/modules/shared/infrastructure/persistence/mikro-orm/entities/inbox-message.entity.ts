import { defineEntity, p } from '@mikro-orm/core';

/**
 * InboxMessageEntitySchema - Definição da entidade InboxMessage para MikroORM v7
 *
 * INVARIANTES NO BANCO:
 * - (consumerName, messageId) UNIQUE - garante deduplicação persistente
 * - payloadHash deve ser SHA-256 (64 caracteres hex) - CHECK
 *
 * DECISÕES DE DESIGN:
 * 1. Chave primária composta (consumerName, messageId) conforme desafio
 * 2. processedAt nullable - mensagens não processadas têm null
 * 3. Índice em processedAt para consultas de mensagens não processadas
 * 4. Sem FK para outras tabelas - é um componente independente
 */
const InboxMessageEntitySchema = defineEntity({
  name: 'InboxMessageEntity',
  tableName: 'inbox_messages',
  properties: {
    messageId: () => p.string().primary(),
    consumerName: () => p.string().primary(),
    payloadHash: () => p.string().length(64).check("payload_hash ~ '^[a-f0-9]{64}$'"),
    receivedAt: () => p.datetime(),
    processedAt: () => p.datetime().nullable().index(),
  },
});

/**
 * InboxMessageEntity - Classe da entidade
 */
export class InboxMessageEntity extends InboxMessageEntitySchema.class {
  constructor(props: {
    messageId: string;
    consumerName: string;
    payloadHash: string;
    receivedAt?: Date;
    processedAt?: Date;
  }) {
    super();
    this.messageId = props.messageId;
    this.consumerName = props.consumerName;
    this.payloadHash = props.payloadHash;
    this.receivedAt = props.receivedAt || new Date();
    this.processedAt = props.processedAt;
  }

  markProcessed(at: Date): void {
    this.processedAt = at;
  }
}

InboxMessageEntitySchema.setClass(InboxMessageEntity);

export { InboxMessageEntitySchema };
