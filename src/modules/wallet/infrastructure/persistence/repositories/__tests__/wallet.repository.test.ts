import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { WalletRepository } from '../wallet.repository';
import { Wallet } from '../../../../domain/aggregates/wallet';
import { Money } from '../../../../domain/value-objects/money';
import { WalletEntitySchema, WalletEntity } from '../../mikro-orm/entities/wallet.entity';

describe('WalletRepository', () => {
  let orm: MikroORM;
  let repository: WalletRepository;

  beforeAll(async () => {
    orm = await MikroORM.init({
      clientUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jungle_gaming',
      entities: [WalletEntitySchema],
      debug: false,
      allowGlobalContext: true,
    });
    await orm.schema.drop();
    await orm.schema.create();
    repository = new WalletRepository(orm.em.fork());
  });

  afterAll(async () => {
    await orm.schema.drop();
    await orm.close();
  });

  beforeEach(async () => {
    await orm.em.fork().execute('DELETE FROM wallets');
    repository = new WalletRepository(orm.em.fork());
  });

  describe('save()', () => {
    it('deve salvar uma nova wallet', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef37',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',
        initialBalance: Money.from({ amount: '1000.00', currency: 'BRL' }),
      });

      await repository.save(wallet);

      const saved = await repository.findById(wallet.id);
      expect(saved).toBeDefined();
      expect(saved?.id).toBe(wallet.id);
      expect(saved?.balance.toJSON()).toEqual({ amount: '1000.00', currency: 'BRL' });
      expect(saved?.version).toBe(1);
    });

    it('deve atualizar uma wallet existente', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef38',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a2',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });

      await repository.save(wallet);

      wallet.debit(Money.from({ amount: '25.00', currency: 'BRL' }), 'tx-123');
      await repository.save(wallet);

      const saved = await repository.findById(wallet.id);
      expect(saved?.balance.toJSON()).toEqual({ amount: '75.00', currency: 'BRL' });
      expect(saved?.version).toBe(2);
    });

    it('deve salvar wallet com saldo zero', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef39',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a0f4b3',
        initialBalance: Money.zero('BRL'),
      });

      await repository.save(wallet);

      const saved = await repository.findById(wallet.id);
      expect(saved?.balance.toJSON()).toEqual({ amount: '0.00', currency: 'BRL' });
      expect(saved?.isEmpty()).toBe(true);
    });
  });

  describe('findById()', () => {
    it('deve buscar wallet por ID', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef40',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a0f4b4',
        initialBalance: Money.from({ amount: '500.00', currency: 'BRL' }),
      });

      await repository.save(wallet);

      const found = await repository.findById(wallet.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(wallet.id);
      expect(found?.balance.toJSON()).toEqual({ amount: '500.00', currency: 'BRL' });
    });

    it('deve retornar null para wallet inexistente', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findByPlayerAndCurrency()', () => {
    it('deve buscar wallet por playerId e currency', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef41',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a0f4b5',
        initialBalance: Money.from({ amount: '200.00', currency: 'BRL' }),
      });

      await repository.save(wallet);

      const found = await repository.findByPlayerAndCurrency('0192f28f-5dc0-7d58-bdb2-814ad6a0f4b5', 'BRL');
      expect(found).toBeDefined();
      expect(found?.playerId).toBe('0192f28f-5dc0-7d58-bdb2-814ad6a0f4b5');
      expect(found?.currency).toBe('BRL');
    });

    it('deve retornar null para combinação inexistente', async () => {
      const found = await repository.findByPlayerAndCurrency('00000000-0000-0000-0000-000000000000', 'USD');
      expect(found).toBeNull();
    });
  });

  describe('exists()', () => {
    it('deve retornar true se wallet existe', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef42',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a0f4b6',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });

      await repository.save(wallet);

      const exists = await repository.exists('0192f28f-5dc0-7d58-bdb2-814ad6a0f4b6', 'BRL');
      expect(exists).toBe(true);
    });

    it('deve retornar false se wallet não existe', async () => {
      const exists = await repository.exists('00000000-0000-0000-0000-000000000000', 'USD');
      expect(exists).toBe(false);
    });
  });

  describe('findByIdForUpdate()', () => {
    it('deve buscar wallet com lock pessimista', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef43',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a0f4b7',
        initialBalance: Money.from({ amount: '300.00', currency: 'BRL' }),
      });

      await repository.save(wallet);

      const result = await orm.em.transactional(async (em) => {
        const repo = new WalletRepository(em);
        return await repo.findByIdForUpdate(wallet.id);
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(wallet.id);
    });

    it('deve retornar null para wallet inexistente com lock', async () => {
      const result = await orm.em.transactional(async (em) => {
        const repo = new WalletRepository(em);
        return await repo.findByIdForUpdate('00000000-0000-0000-0000-000000000000');
      });

      expect(result).toBeNull();
    });
  });

  describe('delete()', () => {
    it('deve deletar uma wallet', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef44',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a0f4b8',
        initialBalance: Money.from({ amount: '50.00', currency: 'BRL' }),
      });

      await repository.save(wallet);
      expect(await repository.findById(wallet.id)).toBeDefined();

      await repository.delete(wallet.id);
      expect(await repository.findById(wallet.id)).toBeNull();
    });
  });

  describe('conversão Domain ↔ Entity', () => {
    it('deve preservar todos os campos na conversão', async () => {
      const original = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef45',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a0f4b9',
        initialBalance: Money.from({ amount: '999.99', currency: 'BRL' }),
      });

      await repository.save(original);

      const saved = await repository.findById(original.id);
      expect(saved?.id).toBe(original.id);
      expect(saved?.playerId).toBe(original.playerId);
      expect(saved?.currency).toBe(original.currency);
      expect(saved?.balance.toJSON()).toEqual(original.balance.toJSON());
      expect(saved?.version).toBe(original.version);
      expect(saved?.createdAt.toISOString()).toBe(original.createdAt.toISOString());
    });
  });
});
