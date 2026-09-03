import { describe, it, expect } from 'bun:test';
import { WagerTransactionProcessedEvent } from '../wager-transaction-processed.event';

describe('WagerTransactionProcessedEvent', () => {
  describe('from()', () => {
    it('deve criar evento com sucesso', () => {
      const event = WagerTransactionProcessedEvent.from({
        transactionId: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        walletId: 'wallet-456',
        playerId: 'player-789',
        roundId: 'round-001',
        gameId: 'game-002',
        kind: 'BET',
        money: { amount: '25.00', currency: 'BRL' },
        status: 'PROCESSED',
        balanceAfter: { amount: '75.00', currency: 'BRL' },
        correlationId: 'corr-123',
      });

      expect(event.eventType).toBe('WagerTransactionProcessed');
      expect(event.version).toBe(1);
      expect(event.aggregateId).toBe('tx-123');
      expect(event.data).toEqual({
        transactionId: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        walletId: 'wallet-456',
        playerId: 'player-789',
        roundId: 'round-001',
        gameId: 'game-002',
        kind: 'BET',
        money: { amount: '25.00', currency: 'BRL' },
        status: 'PROCESSED',
        balanceAfter: { amount: '75.00', currency: 'BRL' },
      });
    });

    it('deve criar evento sem balanceAfter', () => {
      const event = WagerTransactionProcessedEvent.from({
        transactionId: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        walletId: 'wallet-456',
        playerId: 'player-789',
        roundId: 'round-001',
        gameId: 'game-002',
        kind: 'LOSS',
        money: { amount: '25.00', currency: 'BRL' },
        status: 'PROCESSED',
        correlationId: 'corr-123',
      });

      expect(event.data.balanceAfter).toBeUndefined();
    });
  });
});
