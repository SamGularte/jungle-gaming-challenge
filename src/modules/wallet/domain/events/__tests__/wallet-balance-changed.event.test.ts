import { describe, it, expect } from 'bun:test';
import { WalletBalanceChangedEvent } from '../wallet-balance-changed.event';
import { InvalidIntegrationEventError } from '../../../../shared/domain/events/integration-event';

describe('WalletBalanceChangedEvent', () => {
  describe('from()', () => {
    it('deve criar evento com sucesso', () => {
      const event = WalletBalanceChangedEvent.from({
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: 'DEBIT',
        money: { amount: '25.00', currency: 'BRL' },
        balanceBefore: { amount: '100.00', currency: 'BRL' },
        balanceAfter: { amount: '75.00', currency: 'BRL' },
        walletVersion: 2,
        correlationId: 'corr-789',
      });

      expect(event.eventType).toBe('WalletBalanceChanged');
      expect(event.version).toBe(1);
      expect(event.aggregateId).toBe('wallet-123');
      expect(event.correlationId).toBe('corr-789');
      expect(event.data).toEqual({
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: 'DEBIT',
        money: { amount: '25.00', currency: 'BRL' },
        balanceBefore: { amount: '100.00', currency: 'BRL' },
        balanceAfter: { amount: '75.00', currency: 'BRL' },
        walletVersion: 2,
      });
    });

    it('deve criar evento com causationId', () => {
      const event = WalletBalanceChangedEvent.from({
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: 'CREDIT',
        money: { amount: '50.00', currency: 'BRL' },
        balanceBefore: { amount: '100.00', currency: 'BRL' },
        balanceAfter: { amount: '150.00', currency: 'BRL' },
        walletVersion: 2,
        correlationId: 'corr-789',
        causationId: 'cause-123',
      });

      expect(event.causationId).toBe('cause-123');
    });
  });

  describe('serialização', () => {
    it('toJSON() deve serializar corretamente', () => {
      const event = WalletBalanceChangedEvent.from({
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: 'DEBIT',
        money: { amount: '25.00', currency: 'BRL' },
        balanceBefore: { amount: '100.00', currency: 'BRL' },
        balanceAfter: { amount: '75.00', currency: 'BRL' },
        walletVersion: 2,
        correlationId: 'corr-789',
      });

      const json = event.toJSON();

      expect(json.eventType).toBe('WalletBalanceChanged');
      expect(json.version).toBe(1);
      expect(json.aggregateId).toBe('wallet-123');
      expect(json.data.walletId).toBe('wallet-123');
      expect(json.data.direction).toBe('DEBIT');
      expect(json.data.money).toEqual({ amount: '25.00', currency: 'BRL' });
      expect(json.data.balanceBefore).toEqual({ amount: '100.00', currency: 'BRL' });
      expect(json.data.balanceAfter).toEqual({ amount: '75.00', currency: 'BRL' });
    });
  });
});
