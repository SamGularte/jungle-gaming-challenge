import { describe, it, expect } from 'bun:test';
import { WalletLedgerEntry, LedgerDirection, InvalidLedgerError } from '../../wallet/domain/aggregates/wallet-ledger-entry';
import { Money } from '../../wallet/domain/value-objects/money';

describe('WalletLedgerEntry', () => {
  describe('create()', () => {
    it('creates a valid DEBIT entry', () => {
      const entry = WalletLedgerEntry.create({
        walletId: 'wallet-1',
        transactionId: 'txn-1',
        direction: LedgerDirection.DEBIT,
        money: Money.from({ amount: '30.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '70.00', currency: 'BRL' }),
      });

      expect(entry.direction).toBe(LedgerDirection.DEBIT);
      expect(entry.money.toAmountString()).toBe('30.00');
      expect(entry.balanceBefore.toAmountString()).toBe('100.00');
      expect(entry.balanceAfter.toAmountString()).toBe('70.00');
      expect(entry.isBalanced()).toBe(true);
    });

    it('creates a valid CREDIT entry', () => {
      const entry = WalletLedgerEntry.create({
        walletId: 'wallet-1',
        transactionId: 'txn-1',
        direction: LedgerDirection.CREDIT,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '150.00', currency: 'BRL' }),
      });

      expect(entry.direction).toBe(LedgerDirection.CREDIT);
      expect(entry.isBalanced()).toBe(true);
    });

    it('rejects DEBIT with wrong arithmetic', () => {
      expect(() =>
        WalletLedgerEntry.create({
          walletId: 'wallet-1',
          transactionId: 'txn-1',
          direction: LedgerDirection.DEBIT,
          money: Money.from({ amount: '30.00', currency: 'BRL' }),
          balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
          balanceAfter: Money.from({ amount: '60.00', currency: 'BRL' }),
        }),
      ).toThrow(InvalidLedgerError);
    });

    it('rejects CREDIT with wrong arithmetic', () => {
      expect(() =>
        WalletLedgerEntry.create({
          walletId: 'wallet-1',
          transactionId: 'txn-1',
          direction: LedgerDirection.CREDIT,
          money: Money.from({ amount: '50.00', currency: 'BRL' }),
          balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
          balanceAfter: Money.from({ amount: '140.00', currency: 'BRL' }),
        }),
      ).toThrow(InvalidLedgerError);
    });

    it('is immutable - no setter methods', () => {
      const entry = WalletLedgerEntry.create({
        walletId: 'wallet-1',
        transactionId: 'txn-1',
        direction: LedgerDirection.DEBIT,
        money: Money.from({ amount: '30.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '70.00', currency: 'BRL' }),
      });

      expect(entry.id).toBeDefined();
      expect(entry.walletId).toBe('wallet-1');
      expect(entry.transactionId).toBe('txn-1');
      expect(entry.direction).toBe(LedgerDirection.DEBIT);
      expect(entry.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('rehydrate()', () => {
    it('reconstructs entry from state', () => {
      const entry = WalletLedgerEntry.rehydrate({
        id: 'entry-1',
        walletId: 'wallet-1',
        transactionId: 'txn-1',
        direction: LedgerDirection.DEBIT,
        money: { amount: '30.00', currency: 'BRL' },
        balanceBefore: { amount: '100.00', currency: 'BRL' },
        balanceAfter: { amount: '70.00', currency: 'BRL' },
        createdAt: new Date('2025-01-01'),
      });

      expect(entry.id).toBe('entry-1');
      expect(entry.direction).toBe(LedgerDirection.DEBIT);
      expect(entry.isBalanced()).toBe(true);
    });
  });

  describe('toJSON()', () => {
    it('serializes to JSON', () => {
      const entry = WalletLedgerEntry.create({
        walletId: 'wallet-1',
        transactionId: 'txn-1',
        direction: LedgerDirection.DEBIT,
        money: Money.from({ amount: '30.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '70.00', currency: 'BRL' }),
      });

      const json = entry.toJSON();
      expect(json.direction).toBe('DEBIT');
      expect(json.money).toEqual({ amount: '30.00', currency: 'BRL' });
      expect(json.balanceBefore).toEqual({ amount: '100.00', currency: 'BRL' });
      expect(json.balanceAfter).toEqual({ amount: '70.00', currency: 'BRL' });
    });
  });
});
