import { describe, it, expect } from 'bun:test';
import { WalletLedgerEntry, LedgerDirection, InvalidLedgerError } from '../aggregates/wallet-ledger-entry';
import { Money } from '../value-objects/money';

describe('WalletLedgerEntry - Value Object', () => {
  describe('create()', () => {
    it('deve criar entrada DEBIT corretamente', () => {
      const entry = WalletLedgerEntry.create({
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: LedgerDirection.DEBIT,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '75.00', currency: 'BRL' }),
      });

      expect(entry.walletId).toBe('wallet-123');
      expect(entry.transactionId).toBe('tx-456');
      expect(entry.direction).toBe(LedgerDirection.DEBIT);
      expect(entry.money.toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
      expect(entry.balanceBefore.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
      expect(entry.balanceAfter.toJSON()).toEqual({ amount: '75.00', currency: 'BRL' });
      expect(entry.isBalanced()).toBe(true);
    });

    it('deve criar entrada CREDIT corretamente', () => {
      const entry = WalletLedgerEntry.create({
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: LedgerDirection.CREDIT,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '150.00', currency: 'BRL' }),
      });

      expect(entry.direction).toBe(LedgerDirection.CREDIT);
      expect(entry.isBalanced()).toBe(true);
    });

    it('deve rejeitar entrada DEBIT inconsistente', () => {
      expect(() => {
        WalletLedgerEntry.create({
          walletId: 'wallet-123',
          transactionId: 'tx-456',
          direction: LedgerDirection.DEBIT,
          money: Money.from({ amount: '25.00', currency: 'BRL' }),
          balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
          balanceAfter: Money.from({ amount: '80.00', currency: 'BRL' }),
        });
      }).toThrow(InvalidLedgerError);
    });

    it('deve rejeitar entrada CREDIT inconsistente', () => {
      expect(() => {
        WalletLedgerEntry.create({
          walletId: 'wallet-123',
          transactionId: 'tx-456',
          direction: LedgerDirection.CREDIT,
          money: Money.from({ amount: '50.00', currency: 'BRL' }),
          balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
          balanceAfter: Money.from({ amount: '140.00', currency: 'BRL' }),
        });
      }).toThrow(InvalidLedgerError);
    });

    it('deve gerar ID automaticamente', () => {
      const entry = WalletLedgerEntry.create({
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: LedgerDirection.DEBIT,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '75.00', currency: 'BRL' }),
      });

      expect(entry.id).toBeDefined();
      expect(entry.id.length).toBeGreaterThan(0);
    });

    it('deve criar entrada com valores negativos', () => {
      const entry = WalletLedgerEntry.create({
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: LedgerDirection.DEBIT,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
        balanceBefore: Money.fromPersisted({ amount: '-50.00', currency: 'BRL' }),
        balanceAfter: Money.fromPersisted({ amount: '-100.00', currency: 'BRL' }),
      });

      expect(entry.isBalanced()).toBe(true);
      expect(entry.balanceBefore.isNegative()).toBe(true);
      expect(entry.balanceAfter.isNegative()).toBe(true);
    });
  });

  describe('rehydrate()', () => {
    it('deve reconstruir entrada do estado persistido', () => {
      const now = new Date();
      const entry = WalletLedgerEntry.rehydrate({
        id: 'entry-123',
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: LedgerDirection.DEBIT,
        money: { amount: '25.00', currency: 'BRL' },
        balanceBefore: { amount: '100.00', currency: 'BRL' },
        balanceAfter: { amount: '75.00', currency: 'BRL' },
        createdAt: now,
      });

      expect(entry.id).toBe('entry-123');
      expect(entry.walletId).toBe('wallet-123');
      expect(entry.direction).toBe(LedgerDirection.DEBIT);
      expect(entry.money.toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
      expect(entry.createdAt).toBe(now);
    });

    it('deve reconstruir mesmo com estado inconsistente', () => {
      const now = new Date();
      const entry = WalletLedgerEntry.rehydrate({
        id: 'entry-123',
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: LedgerDirection.DEBIT,
        money: { amount: '25.00', currency: 'BRL' },
        balanceBefore: { amount: '100.00', currency: 'BRL' },
        balanceAfter: { amount: '80.00', currency: 'BRL' },
        createdAt: now,
      });

      expect(entry.isBalanced()).toBe(false);
    });
  });

  describe('isBalanced()', () => {
    it('deve retornar true para entrada consistente', () => {
      const entry = WalletLedgerEntry.create({
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: LedgerDirection.DEBIT,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '75.00', currency: 'BRL' }),
      });

      expect(entry.isBalanced()).toBe(true);
    });

    it('deve retornar false para entrada inconsistente', () => {
      const entry = WalletLedgerEntry.rehydrate({
        id: 'entry-123',
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: LedgerDirection.DEBIT,
        money: { amount: '25.00', currency: 'BRL' },
        balanceBefore: { amount: '100.00', currency: 'BRL' },
        balanceAfter: { amount: '80.00', currency: 'BRL' },
        createdAt: new Date(),
      });

      expect(entry.isBalanced()).toBe(false);
    });
  });

  describe('serialização', () => {
    it('deve serializar para JSON', () => {
      const entry = WalletLedgerEntry.create({
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: LedgerDirection.DEBIT,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '75.00', currency: 'BRL' }),
      });

      const json = entry.toJSON();
      expect(json.id).toBe(entry.id);
      expect(json.walletId).toBe('wallet-123');
      expect(json.direction).toBe(LedgerDirection.DEBIT);
      expect(json.money).toEqual({ amount: '25.00', currency: 'BRL' });
      expect(json.balanceBefore).toEqual({ amount: '100.00', currency: 'BRL' });
      expect(json.balanceAfter).toEqual({ amount: '75.00', currency: 'BRL' });
      expect(json.createdAt).toBeDefined();
    });

    it('deve serializar para string', () => {
      const entry = WalletLedgerEntry.create({
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: LedgerDirection.DEBIT,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '75.00', currency: 'BRL' }),
      });

      expect(entry.toString()).toContain('[DEBIT]');
      expect(entry.toString()).toContain('25.00 BRL');
      expect(entry.toString()).toContain('100.00 BRL → 75.00 BRL');
    });
  });
});
