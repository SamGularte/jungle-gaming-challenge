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
    });
    await orm.schema.create();
    walletRepository = new WalletRepository(orm.em);
    ledgerRepository = new LedgerRepository(orm.em);
  });

  afterAll(async () => {
    await orm.schema.drop();
    await orm.close();
  });

  beforeEach(async () => {
    await orm.em.nativeDelete(LedgerEntryEntity, {});
    await orm.em.nativeDelete(WalletEntity, {});
  });

  describe('save()', () => {
    it('deve salvar uma entrada de ledger', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef37',
        playerId: 'player-001',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entry = wallet.debit(
        Money.from({ amount: '25.00', currency: 'BRL' }),
        'tx-001',
      );

      await ledgerRepository.save(entry);

      const saved = await ledgerRepository.findByTransactionId('tx-001');
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
        playerId: 'player-002',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entry1 = wallet.debit(
        Money.from({ amount: '25.00', currency: 'BRL' }),
        'tx-001',
      );

      const entry2 = wallet.credit(
        Money.from({ amount: '50.00', currency: 'BRL' }),
        'tx-002',
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
        playerId: 'player-003',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entries: WalletLedgerEntry[] = [];
      for (let i = 0; i < 5; i++) {
        const entry = wallet.debit(
          Money.from({ amount: '10.00', currency: 'BRL' }),
          `tx-${i}`,
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
        playerId: 'player-004',
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
        playerId: 'player-005',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entry = wallet.debit(
        Money.from({ amount: '25.00', currency: 'BRL' }),
        'tx-001',
      );
      await ledgerRepository.save(entry);

      const found = await ledgerRepository.findByTransactionId('tx-001');
      expect(found).toBeDefined();
      expect(found?.id).toBe(entry.id);
    });

    it('deve retornar null para transactionId inexistente', async () => {
      const found = await ledgerRepository.findByTransactionId('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('findLastByWalletId()', () => {
    it('deve buscar a última entrada da wallet', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef42',
        playerId: 'player-006',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entry1 = wallet.debit(
        Money.from({ amount: '25.00', currency: 'BRL' }),
        'tx-001',
      );
      await ledgerRepository.save(entry1);

      const entry2 = wallet.debit(
        Money.from({ amount: '30.00', currency: 'BRL' }),
        'tx-002',
      );
      await ledgerRepository.save(entry2);

      const last = await ledgerRepository.findLastByWalletId(wallet.id);
      expect(last?.id).toBe(entry2.id);
      expect(last?.balanceAfter.toJSON()).toEqual({ amount: '45.00', currency: 'BRL' });
    });

    it('deve retornar null para wallet sem entradas', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef43',
        playerId: 'player-007',
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
        playerId: 'player-008',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entries: WalletLedgerEntry[] = [];
      for (let i = 0; i < 3; i++) {
        const entry = wallet.debit(
          Money.from({ amount: '10.00', currency: 'BRL' }),
          `tx-${i}`,
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
        playerId: 'player-009',
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
        playerId: 'player-010',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const entries: WalletLedgerEntry[] = [];
      for (let i = 0; i < 10; i++) {
        const entry = wallet.debit(
          Money.from({ amount: '10.00', currency: 'BRL' }),
          `tx-${i}`,
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
        playerId: 'player-011',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const count = await ledgerRepository.countByWalletId(wallet.id);
      expect(count).toBe(0);
    });
  });
});
