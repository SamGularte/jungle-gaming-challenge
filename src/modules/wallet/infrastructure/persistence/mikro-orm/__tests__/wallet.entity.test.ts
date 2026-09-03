import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { WalletEntitySchema, WalletEntity } from '../entities/wallet.entity';

describe('WalletEntity (MikroORM v7)', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      clientUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jungle_gaming',
      entities: [WalletEntitySchema],
      debug: false,
    });
    await orm.schema.create();
  });

  afterAll(async () => {
    await orm.schema.drop();
    await orm.close();
  });

  beforeEach(async () => {
    await orm.em.nativeDelete(WalletEntity, {});
  });

  it('deve criar uma wallet com sucesso', async () => {
    const em = orm.em.fork();

    const wallet = new WalletEntity({
      id: '0192f291-27dd-7d3f-8071-5f8685deef37',
      playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',
      currency: 'BRL',
      balance: '1000.00',
      version: 1,
    });

    await em.persist(wallet).flush();

    const saved = await em.findOne(WalletEntity, {
      id: '0192f291-27dd-7d3f-8071-5f8685deef37',
    });

    expect(saved).toBeDefined();
    expect(saved?.id).toBe('0192f291-27dd-7d3f-8071-5f8685deef37');
    expect(saved?.balance).toBe('1000.00');
  });

  it('deve atualizar saldo com optimistic locking', async () => {
    const em = orm.em.fork();

    const wallet = new WalletEntity({
      id: '0192f291-27dd-7d3f-8071-5f8685deef38',
      playerId: 'player-002',
      currency: 'BRL',
      balance: '100.00',
      version: 1,
    });

    await em.persist(wallet).flush();

    wallet.updateBalance('75.00', 2);
    await em.flush();

    const saved = await em.findOne(WalletEntity, {
      id: '0192f291-27dd-7d3f-8071-5f8685deef38',
    });

    expect(saved?.balance).toBe('75.00');
    expect(saved?.version).toBe(2);
  });

  it('deve respeitar UNIQUE (playerId, currency)', async () => {
    const em = orm.em.fork();

    const wallet1 = new WalletEntity({
      id: '0192f291-27dd-7d3f-8071-5f8685deef39',
      playerId: 'player-003',
      currency: 'BRL',
      balance: '100.00',
      version: 1,
    });

    await em.persist(wallet1).flush();

    const wallet2 = new WalletEntity({
      id: '0192f291-27dd-7d3f-8071-5f8685deef40',
      playerId: 'player-003',
      currency: 'BRL',
      balance: '200.00',
      version: 1,
    });

    await expect(em.persist(wallet2).flush()).rejects.toThrow();
  });

  it('deve rejeitar balance negativo (CHECK)', async () => {
    const em = orm.em.fork();

    const wallet = new WalletEntity({
      id: '0192f291-27dd-7d3f-8071-5f8685deef41',
      playerId: 'player-004',
      currency: 'BRL',
      balance: '-10.00',
      version: 1,
    });

    await expect(em.persist(wallet).flush()).rejects.toThrow();
  });
});
