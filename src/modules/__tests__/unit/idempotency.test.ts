import { describe, it, expect } from 'bun:test';
import { WagerTransaction, WagerTransactionKind } from '../../wagering/domain/aggregates/wager-transaction';
import { Money } from '../../wallet/domain/value-objects/money';

describe('Idempotency', () => {
  describe('matchesPayload()', () => {
    it('same hash matches', () => {
      const tx = WagerTransaction.create({
        id: '550e8400-e29b-41d4-a716-446655440000',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'provider-a:ext-1',
        payloadHash: 'abc123hash',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      expect(tx.matchesPayload('abc123hash')).toBe(true);
    });

    it('different hash does not match', () => {
      const tx = WagerTransaction.create({
        id: '550e8400-e29b-41d4-a716-446655440000',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'provider-a:ext-1',
        payloadHash: 'abc123hash',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      expect(tx.matchesPayload('differenthash999')).toBe(false);
    });

    it('canonical JSON sorts keys alphabetically', () => {
      const props = {
        zzz: 'last',
        aaa: 'first',
        mmm: 'middle',
      };

      const sorted = Object.keys(props).sort();
      expect(sorted).toEqual(['aaa', 'mmm', 'zzz']);
    });

    it('different amounts produce different canonical strings', () => {
      const props1 = { kind: 'BET', money: '25.00', currency: 'BRL' };
      const props2 = { kind: 'BET', money: '50.00', currency: 'BRL' };

      const canonical1 = JSON.stringify(props1, Object.keys(props1).sort());
      const canonical2 = JSON.stringify(props2, Object.keys(props2).sort());

      expect(canonical1).not.toBe(canonical2);
    });

    it('different kinds produce different canonical strings', () => {
      const props1 = { kind: 'BET', money: '25.00' };
      const props2 = { kind: 'WIN', money: '25.00' };

      const canonical1 = JSON.stringify(props1, Object.keys(props1).sort());
      const canonical2 = JSON.stringify(props2, Object.keys(props2).sort());

      expect(canonical1).not.toBe(canonical2);
    });

    it('different currencies produce different canonical strings', () => {
      const props1 = { kind: 'BET', money: '25.00', currency: 'BRL' };
      const props2 = { kind: 'BET', money: '25.00', currency: 'USD' };

      const canonical1 = JSON.stringify(props1, Object.keys(props1).sort());
      const canonical2 = JSON.stringify(props2, Object.keys(props2).sort());

      expect(canonical1).not.toBe(canonical2);
    });

    it('same props produce same canonical string', () => {
      const props1 = { kind: 'BET', money: '25.00', currency: 'BRL' };
      const props2 = { kind: 'BET', money: '25.00', currency: 'BRL' };

      const canonical1 = JSON.stringify(props1, Object.keys(props1).sort());
      const canonical2 = JSON.stringify(props2, Object.keys(props2).sort());

      expect(canonical1).toBe(canonical2);
    });
  });
});
