import { defineEntity, p } from '@mikro-orm/core';

/**
 * LedgerEntryEntitySchema - Definição da entidade LedgerEntry para MikroORM v7
 *
 * Usa a API defineEntity() com property builders (p)
 *
 * INVARIANTES NO BANCO:
 * - direction deve ser DEBIT ou CREDIT (CHECK)
 * - currency deve ser BRL, USD ou EUR (CHECK)
 * - A validação aritmética (balanceAfter = balanceBefore ± amount)
 *   é feita no DOMÍNIO, não no banco
 *
 * DECISÕES DE DESIGN:
 * 1. Ledger é imutável - nunca atualizar, apenas inserir
 * 2. Índices em walletId e transactionId para consultas rápidas
 * 3. Os valores monetários são DECIMAL(20,2) para precisão
 */
const LedgerEntryEntitySchema = defineEntity({
  name: 'LedgerEntryEntity',
  tableName: 'ledger_entries',
  properties: {
    id: () => p.uuid().primary(),
    walletId: () => p.uuid().index(),
    transactionId: () => p.uuid().index(),
    direction: () => p.string().length(10).check("direction IN ('DEBIT', 'CREDIT')"),
    amount: () => p.decimal('string').precision(20).scale(2),
    currency: () => p.string().length(3).check("currency IN ('BRL', 'USD', 'EUR')"),
    balanceBefore: () => p.decimal('string').precision(20).scale(2),
    balanceAfter: () => p.decimal('string').precision(20).scale(2),
    createdAt: () => p.datetime(),
  },
});

/**
 * LedgerEntryEntity - Classe da entidade
 *
 * Representa uma entrada de ledger (histórico financeiro)
 *
 * IMPORTANTE: O ledger é IMUTÁVEL. Nunca atualizar uma entrada.
 * Apenas inserir novas entradas.
 */
export class LedgerEntryEntity extends LedgerEntryEntitySchema.class {
  constructor(props: {
    id: string;
    walletId: string;
    transactionId: string;
    direction: string;
    amount: string;
    currency: string;
    balanceBefore: string;
    balanceAfter: string;
  }) {
    super();
    this.id = props.id;
    this.walletId = props.walletId;
    this.transactionId = props.transactionId;
    this.direction = props.direction;
    this.amount = props.amount;
    this.currency = props.currency;
    this.balanceBefore = props.balanceBefore;
    this.balanceAfter = props.balanceAfter;
    this.createdAt = new Date();
  }
}

LedgerEntryEntitySchema.setClass(LedgerEntryEntity);

export { LedgerEntryEntitySchema };
