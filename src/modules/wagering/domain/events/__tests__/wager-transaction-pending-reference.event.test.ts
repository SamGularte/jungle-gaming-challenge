import { describe, it, expect } from 'bun:test';
import { WagerTransactionPendingReferenceEvent } from '../wager-transaction-pending-reference.event';

describe('WagerTransactionPendingReferenceEvent', () => {
  describe('from()', () => {
    it('deve criar evento com sucesso', () => {
      const event = WagerTransactionPendingReferenceEvent.from({
        transactionId: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        walletId: 'wallet-456',
        playerId: 'player-789',
        roundId: 'round-001',
        gameId: 'game-002',
        kind: 'REFUND',
        money: { amount: '25.00', currency: 'BRL' },
        referenceExternalTransactionId: 'bet-456',
        correlationId: 'corr-123',
      });

      expect(event.eventType).toBe('WagerTransactionPendingReference');
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
        kind: 'REFUND',
        money: { amount: '25.00', currency: 'BRL' },
        referenceExternalTransactionId: 'bet-456',
      });
    });

    it('deve criar evento para ROLLBACK', () => {
      const event = WagerTransactionPendingReferenceEvent.from({
        transactionId: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        walletId: 'wallet-456',
        playerId: 'player-789',
        roundId: 'round-001',
        gameId: 'game-002',
        kind: 'ROLLBACK',
        money: { amount: '50.00', currency: 'BRL' },
        referenceExternalTransactionId: 'win-789',
        correlationId: 'corr-123',
      });

      expect(event.data.kind).toBe('ROLLBACK');
      expect(event.data.referenceExternalTransactionId).toBe('win-789');
    });
  });
});
