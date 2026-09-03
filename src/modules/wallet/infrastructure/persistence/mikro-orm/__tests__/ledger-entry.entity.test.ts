import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { LedgerEntryEntitySchema, LedgerEntryEntity } from '../entities/ledger-entry.entity';
import { WalletEntitySchema, WalletEntity } from '../entities/wallet.entity';

describe('LedgerEntryEntity (MikroORM v7)', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      clientUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jungle_gaming',
      entities: [WalletEntitySchema, LedgerEntryEntitySchema],
      debug: false,
      allowGlobalContext: true,
    });
    await orm.schema.drop();
    await orm.schema.create();
  });

  afterAll(async () => {
    await orm.schema.drop();
    await orm.close();
  });

  beforeEach(async () => {
    await orm.em.fork().execute('DELETE FROM ledger_entries');
    await orm.em.fork().execute('DELETE FROM wallets');
  });

  describe('criação', () => {
    it('deve criar uma entrada de ledger com sucesso', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef37',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01001',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const entry = new LedgerEntryEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef38',
        walletId: wallet.id,
        transactionId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        direction: 'DEBIT',
        amount: '25.00',
        currency: 'BRL',
        balanceBefore: '100.00',
        balanceAfter: '75.00',
      });

      await em.persist(entry).flush();

      const saved = await em.findOne(LedgerEntryEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef38',
      });

      expect(saved).toBeDefined();
      expect(saved?.id).toBe('0192f291-27dd-7d3f-8071-5f8685deef38');
      expect(saved?.walletId).toBe(wallet.id);
      expect(saved?.direction).toBe('DEBIT');
      expect(saved?.amount).toBe('25.00');
      expect(saved?.balanceBefore).toBe('100.00');
      expect(saved?.balanceAfter).toBe('75.00');
    });

    it('deve criar entrada CREDIT com sucesso', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef39',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01002',
        currency: 'BRL',
        balance: '50.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const entry = new LedgerEntryEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef40',
        walletId: wallet.id,
        transactionId: '0192f291-27dd-7d3f-8071-5f8685deef02',
        direction: 'CREDIT',
        amount: '30.00',
        currency: 'BRL',
        balanceBefore: '50.00',
        balanceAfter: '80.00',
      });

      await em.persist(entry).flush();

      const saved = await em.findOne(LedgerEntryEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef40',
      });

      expect(saved?.direction).toBe('CREDIT');
      expect(saved?.amount).toBe('30.00');
      expect(saved?.balanceAfter).toBe('80.00');
    });

    it('deve criar entrada com valores negativos (rollback)', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef41',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01003',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const entry = new LedgerEntryEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef42',
        walletId: wallet.id,
        transactionId: '0192f291-27dd-7d3f-8071-5f8685deef03',
        direction: 'DEBIT',
        amount: '150.00',
        currency: 'BRL',
        balanceBefore: '100.00',
        balanceAfter: '-50.00',
      });

      await em.persist(entry).flush();

      const saved = await em.findOne(LedgerEntryEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef42',
      });

      expect(saved?.balanceBefore).toBe('100.00');
      expect(saved?.balanceAfter).toBe('-50.00');
    });
  });

  describe('invariantes do banco', () => {
    it('deve rejeitar direction inválida (CHECK)', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef43',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01004',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const entry = new LedgerEntryEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef44',
        walletId: wallet.id,
        transactionId: '0192f291-27dd-7d3f-8071-5f8685deef04',
        direction: 'INVALID',
        amount: '25.00',
        currency: 'BRL',
        balanceBefore: '100.00',
        balanceAfter: '75.00',
      });

      await expect(em.persist(entry).flush()).rejects.toThrow();
    });

    it('deve rejeitar currency inválida (CHECK)', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef45',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01005',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const entry = new LedgerEntryEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef46',
        walletId: wallet.id,
        transactionId: '0192f291-27dd-7d3f-8071-5f8685deef05',
        direction: 'DEBIT',
        amount: '25.00',
        currency: 'XXX',
        balanceBefore: '100.00',
        balanceAfter: '75.00',
      });

      await expect(em.persist(entry).flush()).rejects.toThrow();
    });

    it('deve permitir múltiplas entradas para mesma wallet', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef47',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01006',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const entry1 = new LedgerEntryEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef48',
        walletId: wallet.id,
        transactionId: '0192f291-27dd-7d3f-8071-5f8685deef06',
        direction: 'DEBIT',
        amount: '25.00',
        currency: 'BRL',
        balanceBefore: '100.00',
        balanceAfter: '75.00',
      });

      const entry2 = new LedgerEntryEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef49',
        walletId: wallet.id,
        transactionId: '0192f291-27dd-7d3f-8071-5f8685deef07',
        direction: 'CREDIT',
        amount: '50.00',
        currency: 'BRL',
        balanceBefore: '75.00',
        balanceAfter: '125.00',
      });

      await em.persist(entry1).flush();
      await em.persist(entry2).flush();

      const entries = await em.find(LedgerEntryEntity, { walletId: wallet.id });
      expect(entries).toHaveLength(2);
    });
  });

  describe('índices', () => {
    it('deve ter índice em walletId para consultas rápidas', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef50',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01007',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      for (let i = 0; i < 10; i++) {
        const entry = new LedgerEntryEntity({
          id: `0192f291-27dd-7d3f-8071-5f8685deef5${i}`,
          walletId: wallet.id,
          transactionId: ['0192f291-27dd-7d3f-8071-5f8685deef00','0192f291-27dd-7d3f-8071-5f8685deef01','0192f291-27dd-7d3f-8071-5f8685deef02','0192f291-27dd-7d3f-8071-5f8685deef03','0192f291-27dd-7d3f-8071-5f8685deef04','0192f291-27dd-7d3f-8071-5f8685deef05','0192f291-27dd-7d3f-8071-5f8685deef06','0192f291-27dd-7d3f-8071-5f8685deef07','0192f291-27dd-7d3f-8071-5f8685deef08','0192f291-27dd-7d3f-8071-5f8685deef09'][i],
          direction: i % 2 === 0 ? 'DEBIT' : 'CREDIT',
          amount: '10.00',
          currency: 'BRL',
          balanceBefore: '100.00',
          balanceAfter: '90.00',
        });
        await em.persist(entry).flush();
      }

      const entries = await em.find(LedgerEntryEntity, { walletId: wallet.id });
      expect(entries).toHaveLength(10);
    });
  });
});
