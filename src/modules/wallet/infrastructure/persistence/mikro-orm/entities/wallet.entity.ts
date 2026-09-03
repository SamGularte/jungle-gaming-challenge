import { defineEntity, p } from '@mikro-orm/core';

/**
 * WalletEntitySchema - Definição da entidade Wallet para MikroORM v7
 *
 * Usa a API defineEntity() com property builders (p)
 *
 * INVARIANTES NO BANCO:
 * - balance >= 0 (CHECK)
 * - version >= 1 (CHECK)
 * - currency deve ser BRL, USD ou EUR (CHECK)
 * - Unique (player_id, currency)
 */
const WalletEntitySchema = defineEntity({
  name: 'WalletEntity',
  tableName: 'wallets',
  properties: {
    id: () => p.uuid().primary(),
    playerId: () => p.uuid().index(),
    currency: () => p.string().length(3),
    balance: () => p.decimal('string').precision(20).scale(2).check('balance >= 0'),
    version: () => p.integer().check('version >= 1'),
    createdAt: () => p.datetime(),
    updatedAt: () => p.datetime().onUpdate(() => new Date()),
  },
  uniques: [{ properties: ['playerId', 'currency'] }],
  checks: [{ expression: "currency IN ('BRL', 'USD', 'EUR')" }],
});

/**
 * WalletEntity - Classe da entidade
 */
export class WalletEntity extends WalletEntitySchema.class {
  constructor(props: {
    id: string;
    playerId: string;
    currency: string;
    balance: string;
    version: number;
  }) {
    super();
    this.id = props.id;
    this.playerId = props.playerId;
    this.currency = props.currency;
    this.balance = props.balance;
    this.version = props.version;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  updateBalance(newBalance: string, newVersion: number): void {
    this.balance = newBalance;
    this.version = newVersion;
    this.updatedAt = new Date();
  }
}

WalletEntitySchema.setClass(WalletEntity);

export { WalletEntitySchema };
