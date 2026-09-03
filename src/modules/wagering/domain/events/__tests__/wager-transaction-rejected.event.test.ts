import { describe, it, expect } from 'bun:test';
import { WagerTransactionRejectedEvent } from '../wager-transaction-rejected.event';

describe('WagerTransactionRejectedEvent', () => {
  describe('from()', () => {
    it('deve criar evento com sucesso', () => {
      const event = WagerTransactionRejectedEvent.from({
        transactionId: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        walletId: 'wallet-456',
        playerId: 'player-789',
        roundId: 'round-001',
        gameId: 'game-002',
        kind: 'BET',
        money: { amount: '25.00', currency: 'BRL' },
        failureCode: 'INSUFFICIENT_BALANCE',
        reason: 'Saldo insuficiente para realizar a aposta',
        correlationId: 'corr-123',
      });

      expect(event.eventType).toBe('WagerTransactionRejected');
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
        failureCode: 'INSUFFICIENT_BALANCE',
        reason: 'Saldo insuficiente para realizar a aposta',
      });
    });

    it('deve criar evento com diferentes failureCodes', () => {
      const event = WagerTransactionRejectedEvent.from({
        transactionId: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        walletId: 'wallet-456',
        playerId: 'player-789',
        roundId: 'round-001',
        gameId: 'game-002',
        kind: 'REFUND',
        money: { amount: '25.00', currency: 'BRL' },
        failureCode: 'REFERENCE_NOT_FOUND',
        reason: 'Transação referenciada não encontrada',
        correlationId: 'corr-123',
      });

      expect(event.data.failureCode).toBe('REFERENCE_NOT_FOUND');
    });
  });
});
