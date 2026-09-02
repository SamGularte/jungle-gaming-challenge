import { describe, it, expect, beforeEach } from 'bun:test';
import {
  Wallet,
  InsufficientBalanceError,
  InvalidWalletOperationError,
  CurrencyMismatchError,
} from '../aggregates/wallet';
import { WalletLedgerEntry, LedgerDirection } from '../aggregates/wallet-ledger-entry';
import { Money } from '../value-objects/money';

describe('Wallet - Aggregate Root', () => {
  describe('Wallet.open()', () => {
    it('deve criar carteira com saldo inicial positivo', () => {
      const wallet = Wallet.open({
        id: 'wallet-123',
        playerId: 'player-456',
        initialBalance: Money.from({ amount: '1000.00', currency: 'BRL' }),
      });

      expect(wallet.id).toBe('wallet-123');
      expect(wallet.playerId).toBe('player-456');
      expect(wallet.currency).toBe('BRL');
      expect(wallet.balance.toJSON()).toEqual({ amount: '1000.00', currency: 'BRL' });
      expect(wallet.version).toBe(1);
      expect(wallet.createdAt).toBeInstanceOf(Date);
      expect(wallet.updatedAt).toBeInstanceOf(Date);
    });

    it('deve criar carteira com saldo inicial zero', () => {
      const wallet = Wallet.open({
        id: 'wallet-123',
        playerId: 'player-456',
        initialBalance: Money.zero('BRL'),
      });

      expect(wallet.balance.toJSON()).toEqual({ amount: '0.00', currency: 'BRL' });
      expect(wallet.isEmpty()).toBe(true);
    });

    it('deve rejeitar saldo inicial negativo', () => {
      const negativeBalance = Money.from({ amount: '1000.00', currency: 'BRL' }).negate();

      expect(() => {
        Wallet.open({
          id: 'wallet-123',
          playerId: 'player-456',
          initialBalance: negativeBalance,
        });
      }).toThrow(InvalidWalletOperationError);
    });
  });

  describe('Wallet.rehydrate()', () => {
    it('deve reconstruir wallet do estado persistido', () => {
      const now = new Date();
      const wallet = Wallet.rehydrate({
        id: 'wallet-123',
        playerId: 'player-456',
        currency: 'BRL',
        balance: { amount: '500.00', currency: 'BRL' },
        version: 5,
        createdAt: now,
        updatedAt: now,
      });

      expect(wallet.id).toBe('wallet-123');
      expect(wallet.playerId).toBe('player-456');
      expect(wallet.currency).toBe('BRL');
      expect(wallet.balance.toJSON()).toEqual({ amount: '500.00', currency: 'BRL' });
      expect(wallet.version).toBe(5);
      expect(wallet.createdAt).toBe(now);
      expect(wallet.updatedAt).toBe(now);
    });

    it('deve reconstruir mesmo com estado inconsistente', () => {
      const wallet = Wallet.rehydrate({
        id: 'wallet-123',
        playerId: 'player-456',
        currency: 'BRL',
        balance: { amount: '-100.00', currency: 'BRL' },
        version: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(wallet.balance.isNegative()).toBe(true);
    });
  });

  describe('debit()', () => {
    let wallet: Wallet;

    beforeEach(() => {
      wallet = Wallet.open({
        id: 'wallet-123',
        playerId: 'player-456',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
    });

    it('deve debitar saldo com sucesso', () => {
      const entry = wallet.debit(
        Money.from({ amount: '25.00', currency: 'BRL' }),
        'tx-123',
      );

      expect(wallet.balance.toJSON()).toEqual({ amount: '75.00', currency: 'BRL' });
      expect(wallet.version).toBe(2);

      expect(entry).toBeInstanceOf(WalletLedgerEntry);
      expect(entry.direction).toBe(LedgerDirection.DEBIT);
      expect(entry.money.toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
      expect(entry.balanceBefore.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
      expect(entry.balanceAfter.toJSON()).toEqual({ amount: '75.00', currency: 'BRL' });
    });

    it('deve rejeitar débito com moeda diferente', () => {
      expect(() => {
        wallet.debit(
          Money.from({ amount: '25.00', currency: 'USD' }),
          'tx-123',
        );
      }).toThrow(CurrencyMismatchError);
    });

    it('deve rejeitar débito com saldo insuficiente', () => {
      expect(() => {
        wallet.debit(
          Money.from({ amount: '150.00', currency: 'BRL' }),
          'tx-123',
        );
      }).toThrow(InsufficientBalanceError);
    });

    it('deve permitir débito exato do saldo', () => {
      const entry = wallet.debit(
        Money.from({ amount: '100.00', currency: 'BRL' }),
        'tx-123',
      );

      expect(wallet.balance.toJSON()).toEqual({ amount: '0.00', currency: 'BRL' });
      expect(wallet.isEmpty()).toBe(true);
      expect(entry.balanceAfter.toJSON()).toEqual({ amount: '0.00', currency: 'BRL' });
    });

    it('deve incrementar a versão a cada débito', () => {
      expect(wallet.version).toBe(1);

      wallet.debit(Money.from({ amount: '25.00', currency: 'BRL' }), 'tx-1');
      expect(wallet.version).toBe(2);

      wallet.debit(Money.from({ amount: '25.00', currency: 'BRL' }), 'tx-2');
      expect(wallet.version).toBe(3);
    });

    it('deve atualizar updatedAt a cada débito', () => {
      const initialUpdatedAt = wallet.updatedAt;

      const start = Date.now();
      while (Date.now() - start < 10) { /* espera 10ms */ }

      wallet.debit(Money.from({ amount: '25.00', currency: 'BRL' }), 'tx-1');

      expect(wallet.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
    });
  });

  describe('credit()', () => {
    let wallet: Wallet;

    beforeEach(() => {
      wallet = Wallet.open({
        id: 'wallet-123',
        playerId: 'player-456',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
    });

    it('deve credit saldo com sucesso', () => {
      const entry = wallet.credit(
        Money.from({ amount: '50.00', currency: 'BRL' }),
        'tx-123',
      );

      expect(wallet.balance.toJSON()).toEqual({ amount: '150.00', currency: 'BRL' });
      expect(wallet.version).toBe(2);

      expect(entry.direction).toBe(LedgerDirection.CREDIT);
      expect(entry.money.toJSON()).toEqual({ amount: '50.00', currency: 'BRL' });
      expect(entry.balanceBefore.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
      expect(entry.balanceAfter.toJSON()).toEqual({ amount: '150.00', currency: 'BRL' });
    });

    it('deve rejeitar crédito com moeda diferente', () => {
      expect(() => {
        wallet.credit(
          Money.from({ amount: '50.00', currency: 'USD' }),
          'tx-123',
        );
      }).toThrow(CurrencyMismatchError);
    });

    it('deve incrementar a versão a cada crédito', () => {
      expect(wallet.version).toBe(1);

      wallet.credit(Money.from({ amount: '50.00', currency: 'BRL' }), 'tx-1');
      expect(wallet.version).toBe(2);

      wallet.credit(Money.from({ amount: '25.00', currency: 'BRL' }), 'tx-2');
      expect(wallet.version).toBe(3);
    });
  });

  describe('operações combinadas', () => {
    it('deve realizar múltiplas operações em sequência', () => {
      const wallet = Wallet.open({
        id: 'wallet-123',
        playerId: 'player-456',
        initialBalance: Money.from({ amount: '1000.00', currency: 'BRL' }),
      });

      wallet.debit(Money.from({ amount: '100.00', currency: 'BRL' }), 'tx-1');
      expect(wallet.balance.toJSON()).toEqual({ amount: '900.00', currency: 'BRL' });

      wallet.credit(Money.from({ amount: '50.00', currency: 'BRL' }), 'tx-2');
      expect(wallet.balance.toJSON()).toEqual({ amount: '950.00', currency: 'BRL' });

      wallet.debit(Money.from({ amount: '200.00', currency: 'BRL' }), 'tx-3');
      expect(wallet.balance.toJSON()).toEqual({ amount: '750.00', currency: 'BRL' });

      expect(wallet.version).toBe(4);
    });

    it('deve manter consistência entre wallet e ledger', () => {
      const wallet = Wallet.open({
        id: 'wallet-123',
        playerId: 'player-456',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });

      const entries: WalletLedgerEntry[] = [];

      entries.push(wallet.debit(Money.from({ amount: '30.00', currency: 'BRL' }), 'tx-1'));
      entries.push(wallet.credit(Money.from({ amount: '20.00', currency: 'BRL' }), 'tx-2'));
      entries.push(wallet.debit(Money.from({ amount: '10.00', currency: 'BRL' }), 'tx-3'));

      let expectedBalance = Money.from({ amount: '100.00', currency: 'BRL' });

      for (const entry of entries) {
        if (entry.direction === LedgerDirection.DEBIT) {
          expectedBalance = expectedBalance.subtract(entry.money);
        } else {
          expectedBalance = expectedBalance.add(entry.money);
        }

        expect(entry.balanceAfter.equals(expectedBalance)).toBe(true);
      }

      expect(wallet.balance.toJSON()).toEqual({ amount: '80.00', currency: 'BRL' });
    });
  });

  describe('cenário obrigatório: duas apostas concorrentes', () => {
    it('deve processar corretamente duas apostas de 80.00 com saldo 100.00', () => {
      const wallet = Wallet.open({
        id: 'wallet-123',
        playerId: 'player-456',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });

      const entry1 = wallet.debit(
        Money.from({ amount: '80.00', currency: 'BRL' }),
        'tx-1',
      );
      expect(wallet.balance.toJSON()).toEqual({ amount: '20.00', currency: 'BRL' });
      expect(entry1.balanceAfter.toJSON()).toEqual({ amount: '20.00', currency: 'BRL' });

      expect(() => {
        wallet.debit(
          Money.from({ amount: '80.00', currency: 'BRL' }),
          'tx-2',
        );
      }).toThrow(InsufficientBalanceError);

      expect(wallet.balance.toJSON()).toEqual({ amount: '20.00', currency: 'BRL' });
      expect(wallet.version).toBe(2);
    });
  });

  describe('consultas de domínio', () => {
    it('hasSufficientBalance() deve verificar saldo suficiente', () => {
      const wallet = Wallet.open({
        id: 'wallet-123',
        playerId: 'player-456',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });

      expect(wallet.hasSufficientBalance(Money.from({ amount: '50.00', currency: 'BRL' }))).toBe(true);
      expect(wallet.hasSufficientBalance(Money.from({ amount: '150.00', currency: 'BRL' }))).toBe(false);
      expect(wallet.hasSufficientBalance(Money.from({ amount: '50.00', currency: 'USD' }))).toBe(false);
    });

    it('isEmpty() deve verificar se a carteira está vazia', () => {
      const wallet1 = Wallet.open({
        id: 'wallet-123',
        playerId: 'player-456',
        initialBalance: Money.zero('BRL'),
      });

      const wallet2 = Wallet.open({
        id: 'wallet-456',
        playerId: 'player-789',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });

      expect(wallet1.isEmpty()).toBe(true);
      expect(wallet2.isEmpty()).toBe(false);
    });
  });

  describe('serialização', () => {
    it('deve serializar para JSON', () => {
      const wallet = Wallet.open({
        id: 'wallet-123',
        playerId: 'player-456',
        initialBalance: Money.from({ amount: '1000.00', currency: 'BRL' }),
      });

      const json = wallet.toJSON();
      expect(json.id).toBe('wallet-123');
      expect(json.playerId).toBe('player-456');
      expect(json.currency).toBe('BRL');
      expect(json.balance).toEqual({ amount: '1000.00', currency: 'BRL' });
      expect(json.version).toBe(1);
      expect(json.createdAt).toBeDefined();
      expect(json.updatedAt).toBeDefined();
    });

    it('deve serializar para string', () => {
      const wallet = Wallet.open({
        id: 'wallet-123',
        playerId: 'player-456',
        initialBalance: Money.from({ amount: '1000.00', currency: 'BRL' }),
      });

      const str = wallet.toString();
      expect(str).toContain('wallet-123');
      expect(str).toContain('player-456');
      expect(str).toContain('BRL');
      expect(str).toContain('1000.00');
      expect(str).toContain('version=1');
    });
  });
});
