import { describe, it, expect } from 'bun:test';
import { Wallet, InsufficientBalanceError } from '../../wallet/domain/aggregates/wallet';
import { Money } from '../../wallet/domain/value-objects/money';

describe('Wallet', () => {
  describe('open()', () => {
    it('creates wallet with initial balance', () => {
      const wallet = Wallet.open({
        id: '550e8400-e29b-41d4-a716-446655440000',
        playerId: '550e8400-e29b-41d4-a716-446655440001',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });

      expect(wallet.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(wallet.playerId).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(wallet.currency).toBe('BRL');
      expect(wallet.balance.toAmountString()).toBe('100.00');
      expect(wallet.version).toBe(1);
    });

    it('creates wallet with zero balance', () => {
      const wallet = Wallet.open({
        id: '550e8400-e29b-41d4-a716-446655440000',
        playerId: '550e8400-e29b-41d4-a716-446655440001',
        initialBalance: Money.zero('BRL'),
      });

      expect(wallet.balance.toAmountString()).toBe('0.00');
      expect(wallet.version).toBe(1);
    });
  });

  describe('debit()', () => {
    it('decreases balance and creates ledger entry', () => {
      const wallet = Wallet.open({
        id: '550e8400-e29b-41d4-a716-446655440000',
        playerId: '550e8400-e29b-41d4-a716-446655440001',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });

      const entry = wallet.debit(Money.from({ amount: '30.00', currency: 'BRL' }), 'txn-1');

      expect(wallet.balance.toAmountString()).toBe('70.00');
      expect(wallet.version).toBe(2);
      expect(entry.direction).toBe('DEBIT');
      expect(entry.balanceBefore.toAmountString()).toBe('100.00');
      expect(entry.balanceAfter.toAmountString()).toBe('70.00');
      expect(entry.isBalanced()).toBe(true);
    });

    it('rejects debit when insufficient balance', () => {
      const wallet = Wallet.open({
        id: '550e8400-e29b-41d4-a716-446655440000',
        playerId: '550e8400-e29b-41d4-a716-446655440001',
        initialBalance: Money.from({ amount: '10.00', currency: 'BRL' }),
      });

      expect(() =>
        wallet.debit(Money.from({ amount: '30.00', currency: 'BRL' }), 'txn-1'),
      ).toThrow(InsufficientBalanceError);

      expect(wallet.balance.toAmountString()).toBe('10.00');
      expect(wallet.version).toBe(1);
    });

    it('rejects debit of different currency', () => {
      const wallet = Wallet.open({
        id: '550e8400-e29b-41d4-a716-446655440000',
        playerId: '550e8400-e29b-41d4-a716-446655440001',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });

      expect(() =>
        wallet.debit(Money.from({ amount: '30.00', currency: 'USD' }), 'txn-1'),
      ).toThrow();
    });
  });

  describe('credit()', () => {
    it('increases balance and creates ledger entry', () => {
      const wallet = Wallet.open({
        id: '550e8400-e29b-41d4-a716-446655440000',
        playerId: '550e8400-e29b-41d4-a716-446655440001',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });

      const entry = wallet.credit(Money.from({ amount: '50.00', currency: 'BRL' }), 'txn-1');

      expect(wallet.balance.toAmountString()).toBe('150.00');
      expect(wallet.version).toBe(2);
      expect(entry.direction).toBe('CREDIT');
      expect(entry.balanceBefore.toAmountString()).toBe('100.00');
      expect(entry.balanceAfter.toAmountString()).toBe('150.00');
      expect(entry.isBalanced()).toBe(true);
    });
  });

  describe('version tracking', () => {
    it('increments version only on balance change', () => {
      const wallet = Wallet.open({
        id: '550e8400-e29b-41d4-a716-446655440000',
        playerId: '550e8400-e29b-41d4-a716-446655440001',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });

      expect(wallet.version).toBe(1);

      wallet.debit(Money.from({ amount: '30.00', currency: 'BRL' }), 'txn-1');
      expect(wallet.version).toBe(2);

      wallet.credit(Money.from({ amount: '20.00', currency: 'BRL' }), 'txn-2');
      expect(wallet.version).toBe(3);
    });
  });

  describe('rehydrate()', () => {
    it('reconstructs wallet from state', () => {
      const wallet = Wallet.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        playerId: '550e8400-e29b-41d4-a716-446655440001',
        currency: 'BRL',
        balance: { amount: '70.00', currency: 'BRL' },
        version: 2,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-02'),
      });

      expect(wallet.balance.toAmountString()).toBe('70.00');
      expect(wallet.version).toBe(2);
    });
  });
});
