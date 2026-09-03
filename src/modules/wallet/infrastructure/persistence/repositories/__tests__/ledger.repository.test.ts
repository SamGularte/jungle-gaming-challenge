import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { LedgerRepository } from '../ledger.repository';
import { WalletRepository } from '../wallet.repository';
import { Wallet } from '../../../../domain/aggregates/wallet';
import { WalletLedgerEntry, LedgerDirection } from '../../../../domain/aggregates/wallet-ledger-entry';
import { Money } from '../../../../domain/value-objects/money';
import { WalletEntitySchema, WalletEntity } from '../../mikro-orm/entities/wallet.entity';
import { LedgerEntryEntitySchema, LedgerEntryEntity } from '../../mikro-orm/entities/ledger-entry.entity';

describe('LedgerRepository', () => {
  let orm: MikroORM;
  let walletRepository: WalletRepository;
  let ledgerRepository: LedgerRepository;

  beforeAll(async () => {
    orm = await MikroORM.init({
      clientUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jungle_gaming',
      entities: [WalletEntitySchema, LedgerEntryEntitySchema],
      debug: false,
      allowGlobalContext: true,
    });
    await orm.schema.drop();
    await orm.schema.create();
    walletRepository = new WalletRepository(orm.em.fork());
    ledgerRepository = new LedgerRepository(orm.em.fork());
  });

  afterAll(async () => {
    await orm.schema.drop();
    await orm.close();
  });

  beforeEach(async () => {
    await orm.em.fork().execute('DELETE FROM ledger_entries');
    await orm.em.fork().execute('DELETE FROM wallets');
  });

  describe('save()', () => {
    it('deve salvar uma entrada de ledger', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef37',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01001',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entry = wallet.debit(
        Money.from({ amount: '25.00', currency: 'BRL' }),
        '0192f291-27dd-7d3f-8071-5f8685deef01',
      );

      await ledgerRepository.save(entry);

      const saved = await ledgerRepository.findByTransactionId('0192f291-27dd-7d3f-8071-5f8685deef01');
      expect(saved).toBeDefined();
      expect(saved?.id).toBe(entry.id);
      expect(saved?.money.toJSON()).toEqual(entry.money.toJSON());
      expect(saved?.direction).toBe(LedgerDirection.DEBIT);
    });
  });

  describe('saveMany()', () => {
    it('deve salvar múltiplas entradas', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef38',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01002',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entry1 = wallet.debit(
        Money.from({ amount: '25.00', currency: 'BRL' }),
        '0192f291-27dd-7d3f-8071-5f8685deef01',
      );

      const entry2 = wallet.credit(
        Money.from({ amount: '50.00', currency: 'BRL' }),
        '0192f291-27dd-7d3f-8071-5f8685deef02',
      );

      await ledgerRepository.saveMany([entry1, entry2]);

      const count = await ledgerRepository.countByWalletId(wallet.id);
      expect(count).toBe(2);
    });
  });

  describe('findByWalletId()', () => {
    it('deve buscar entradas com paginação', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef39',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01003',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entries: WalletLedgerEntry[] = [];
      for (let i = 0; i < 5; i++) {
        const entry = wallet.debit(
          Money.from({ amount: '10.00', currency: 'BRL' }),
          `0192f291-27dd-7d3f-8071-5f8685deef${i.toString(16).padStart(2, '0')}`,
        );
        entries.push(entry);
      }
      await ledgerRepository.saveMany(entries);

      const result = await ledgerRepository.findByWalletId(wallet.id, 3);
      expect(result.entries).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
    });

    it('deve retornar entradas vazio para wallet sem entradas', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef40',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01004',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const result = await ledgerRepository.findByWalletId(wallet.id);
      expect(result.entries).toHaveLength(0);
      expect(result.nextCursor).toBeUndefined();
    });
  });

  describe('findByTransactionId()', () => {
    it('deve buscar entrada por transactionId', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef41',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01005',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entry = wallet.debit(
        Money.from({ amount: '25.00', currency: 'BRL' }),
        '0192f291-27dd-7d3f-8071-5f8685deef01',
      );
      await ledgerRepository.save(entry);

      const found = await ledgerRepository.findByTransactionId('0192f291-27dd-7d3f-8071-5f8685deef01');
      expect(found).toBeDefined();
      expect(found?.id).toBe(entry.id);
    });

    it('deve retornar null para transactionId inexistente', async () => {
      const found = await ledgerRepository.findByTransactionId('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findLastByWalletId()', () => {
    it('deve buscar a última entrada da wallet', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef42',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01006',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entry1 = wallet.debit(
        Money.from({ amount: '25.00', currency: 'BRL' }),
        '0192f291-27dd-7d3f-8071-5f8685deef01',
      );
      await ledgerRepository.save(entry1);

      const entry2 = wallet.debit(
        Money.from({ amount: '30.00', currency: 'BRL' }),
        '0192f291-27dd-7d3f-8071-5f8685deef02',
      );
      await ledgerRepository.save(entry2);

      const last = await ledgerRepository.findLastByWalletId(wallet.id);
      expect(last?.id).toBe(entry2.id);
      expect(last?.balanceAfter.toJSON()).toEqual({ amount: '45.00', currency: 'BRL' });
    });

    it('deve retornar null para wallet sem entradas', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef43',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01007',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const last = await ledgerRepository.findLastByWalletId(wallet.id);
      expect(last).toBeNull();
    });
  });

  describe('calculateBalance()', () => {
    it('deve calcular o saldo a partir do ledger', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef44',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01008',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entries: WalletLedgerEntry[] = [];
      for (let i = 0; i < 3; i++) {
        const entry = wallet.debit(
          Money.from({ amount: '10.00', currency: 'BRL' }),
          `0192f291-27dd-7d3f-8071-5f8685deef${i.toString(16).padStart(2, '0')}`,
        );
        entries.push(entry);
      }
      await ledgerRepository.saveMany(entries);

      const balance = await ledgerRepository.calculateBalance(wallet.id);
      expect(balance.amount).toBe('70.00');
    });

    it('deve retornar zero para wallet sem entradas', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef45',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01009',
        initialBalance: Money.from({ amount: '0.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const balance = await ledgerRepository.calculateBalance(wallet.id);
      expect(balance.amount).toBe('0.00');
    });
  });

  describe('countByWalletId()', () => {
    it('deve contar entradas da wallet', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef46',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01010',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entries: WalletLedgerEntry[] = [];
      for (let i = 0; i < 10; i++) {
        const entry = wallet.debit(
          Money.from({ amount: '10.00', currency: 'BRL' }),
          `0192f291-27dd-7d3f-8071-5f8685deef${i.toString(16).padStart(2, '0')}`,
        );
        entries.push(entry);
      }
      await ledgerRepository.saveMany(entries);

      const count = await ledgerRepository.countByWalletId(wallet.id);
      expect(count).toBe(10);
    });

    it('deve retornar 0 para wallet sem entradas', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef47',
        playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a01011',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const count = await ledgerRepository.countByWalletId(wallet.id);
      expect(count).toBe(0);
    });
  });
});
