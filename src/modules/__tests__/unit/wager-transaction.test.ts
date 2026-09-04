import { describe, it, expect } from 'bun:test';
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
  FailureCode,
  InvalidTransactionError,
} from '../../wagering/domain/aggregates/wager-transaction';
import { Money } from '../../wallet/domain/value-objects/money';

function createBET(overrides: Partial<Parameters<typeof WagerTransaction.create>[0]> = {}) {
  return WagerTransaction.create({
    id: '550e8400-e29b-41d4-a716-446655440000',
    providerId: 'provider-a',
    externalTransactionId: 'ext-1',
    idempotencyKey: 'provider-a:ext-1',
    payloadHash: 'abc123',
    walletId: '550e8400-e29b-41d4-a716-446655440001',
    playerId: '550e8400-e29b-41d4-a716-446655440002',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: WagerTransactionKind.BET,
    money: Money.from({ amount: '25.00', currency: 'BRL' }),
    ...overrides,
  });
}

function createREFUND(refExternalId: string = 'ext-1') {
  return WagerTransaction.create({
    id: '550e8400-e29b-41d4-a716-446655440003',
    providerId: 'provider-a',
    externalTransactionId: 'refund-1',
    idempotencyKey: 'provider-a:refund-1',
    payloadHash: 'def456',
    walletId: '550e8400-e29b-41d4-a716-446655440001',
    playerId: '550e8400-e29b-41d4-a716-446655440002',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: WagerTransactionKind.REFUND,
    money: Money.from({ amount: '25.00', currency: 'BRL' }),
    referenceExternalTransactionId: refExternalId,
  });
}

function createROLLBACK(refExternalId: string = 'ext-1') {
  return WagerTransaction.create({
    id: '550e8400-e29b-41d4-a716-446655440004',
    providerId: 'provider-a',
    externalTransactionId: 'rollback-1',
    idempotencyKey: 'provider-a:rollback-1',
    payloadHash: 'ghi789',
    walletId: '550e8400-e29b-41d4-a716-446655440001',
    playerId: '550e8400-e29b-41d4-a716-446655440002',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: WagerTransactionKind.ROLLBACK,
    money: Money.from({ amount: '25.00', currency: 'BRL' }),
    referenceExternalTransactionId: refExternalId,
  });
}

describe('WagerTransaction', () => {
  describe('create()', () => {
    it('creates BET transaction in PENDING status', () => {
      const tx = createBET();
      expect(tx.status).toBe(WagerTransactionStatus.PENDING);
      expect(tx.kind).toBe(WagerTransactionKind.BET);
    });

    it('rejects OPENING via create', () => {
      expect(() =>
        WagerTransaction.create({
          ...createBET(),
          kind: WagerTransactionKind.OPENING,
        }),
      ).toThrow(InvalidTransactionError);
    });

    it('REFUND requires referenceExternalTransactionId', () => {
      expect(() =>
        WagerTransaction.create({
          ...createBET(),
          kind: WagerTransactionKind.REFUND,
          referenceExternalTransactionId: undefined,
        }),
      ).toThrow(InvalidTransactionError);
    });

    it('ROLLBACK requires referenceExternalTransactionId', () => {
      expect(() =>
        WagerTransaction.create({
          ...createBET(),
          kind: WagerTransactionKind.ROLLBACK,
          referenceExternalTransactionId: undefined,
        }),
      ).toThrow(InvalidTransactionError);
    });
  });

  describe('requiresReference()', () => {
    it('REFUND requires reference', () => {
      expect(createREFUND().requiresReference()).toBe(true);
    });

    it('ROLLBACK requires reference', () => {
      expect(createROLLBACK().requiresReference()).toBe(true);
    });

    it('BET does not require reference', () => {
      expect(createBET().requiresReference()).toBe(false);
    });
  });

  describe('affectsBalance()', () => {
    it('BET affects balance', () => {
      expect(createBET().affectsBalance()).toBe(true);
    });

    it('LOSS does not affect balance', () => {
      const tx = WagerTransaction.create({
        ...createBET(),
        kind: WagerTransactionKind.LOSS,
        externalTransactionId: 'loss-1',
        idempotencyKey: 'provider-a:loss-1',
        payloadHash: 'loss-hash',
      });
      expect(tx.affectsBalance()).toBe(false);
    });
  });

  describe('isValidReference()', () => {
    it('REFUND only references BET', () => {
      const refund = createREFUND();
      const bet = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'provider-a:ext-1',
        payloadHash: 'abc123',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: { amount: '25.00', currency: 'BRL' },
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });

      expect(refund.isValidReference(bet)).toBe(true);

      const win = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440005',
        providerId: 'provider-a',
        externalTransactionId: 'win-1',
        idempotencyKey: 'provider-a:win-1',
        payloadHash: 'win-hash',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.WIN,
        money: { amount: '25.00', currency: 'BRL' },
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });

      expect(refund.isValidReference(win)).toBe(false);
    });

    it('ROLLBACK references BET, WIN, or REFUND', () => {
      const rollback = createROLLBACK();

      const bet = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'provider-a:ext-1',
        payloadHash: 'abc123',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: { amount: '25.00', currency: 'BRL' },
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });
      expect(rollback.isValidReference(bet)).toBe(true);

      const win = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440005',
        providerId: 'provider-a',
        externalTransactionId: 'win-1',
        idempotencyKey: 'provider-a:win-1',
        payloadHash: 'win-hash',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.WIN,
        money: { amount: '25.00', currency: 'BRL' },
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });
      expect(rollback.isValidReference(win)).toBe(true);

      const refund = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440006',
        providerId: 'provider-a',
        externalTransactionId: 'ref-1',
        idempotencyKey: 'provider-a:ref-1',
        payloadHash: 'ref-hash',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.REFUND,
        money: { amount: '25.00', currency: 'BRL' },
        referenceExternalTransactionId: 'ext-1',
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });
      expect(rollback.isValidReference(refund)).toBe(true);

      const loss = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440007',
        providerId: 'provider-a',
        externalTransactionId: 'loss-1',
        idempotencyKey: 'provider-a:loss-1',
        payloadHash: 'loss-hash',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.LOSS,
        money: { amount: '25.00', currency: 'BRL' },
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });
      expect(rollback.isValidReference(loss)).toBe(false);
    });

    it('rejects reference with wrong provider', () => {
      const refund = createREFUND();
      const bet = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        providerId: 'provider-b',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'provider-b:ext-1',
        payloadHash: 'abc123',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: { amount: '25.00', currency: 'BRL' },
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });
      expect(refund.isValidReference(bet)).toBe(false);
    });

    it('rejects reference with wrong player', () => {
      const refund = createREFUND();
      const bet = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'provider-a:ext-1',
        payloadHash: 'abc123',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: 'player-b',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: { amount: '25.00', currency: 'BRL' },
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });
      expect(refund.isValidReference(bet)).toBe(false);
    });

    it('rejects reference with wrong wallet', () => {
      const refund = createREFUND();
      const bet = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'provider-a:ext-1',
        payloadHash: 'abc123',
        walletId: 'wallet-b',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: { amount: '25.00', currency: 'BRL' },
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });
      expect(refund.isValidReference(bet)).toBe(false);
    });

    it('rejects reference with wrong currency', () => {
      const refund = createREFUND();
      const bet = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'provider-a:ext-1',
        payloadHash: 'abc123',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: { amount: '25.00', currency: 'USD' },
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });
      expect(refund.isValidReference(bet)).toBe(false);
    });

    it('rejects reference with wrong round', () => {
      const refund = createREFUND();
      const bet = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'provider-a:ext-1',
        payloadHash: 'abc123',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-2',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: { amount: '25.00', currency: 'BRL' },
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });
      expect(refund.isValidReference(bet)).toBe(false);
    });

    it('rejects reference that is not PROCESSED', () => {
      const refund = createREFUND();
      const bet = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'provider-a:ext-1',
        payloadHash: 'abc123',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: { amount: '25.00', currency: 'BRL' },
        status: WagerTransactionStatus.PENDING,
        createdAt: new Date(),
      });
      expect(refund.isValidReference(bet)).toBe(false);
    });

    it('rejects reference with different amount', () => {
      const refund = createREFUND();
      const bet = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'provider-a:ext-1',
        payloadHash: 'abc123',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: { amount: '50.00', currency: 'BRL' },
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });
      expect(refund.isValidReference(bet)).toBe(false);
    });
  });

  describe('matchesPayload()', () => {
    it('matches identical hash', () => {
      const tx = createBET();
      expect(tx.matchesPayload('abc123')).toBe(true);
    });

    it('rejects different hash', () => {
      const tx = createBET();
      expect(tx.matchesPayload('different')).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('markProcessed transitions to PROCESSED', () => {
      const tx = createBET();
      tx.markProcessed(undefined, new Date());
      expect(tx.status).toBe(WagerTransactionStatus.PROCESSED);
    });

    it('markPendingReference transitions to PENDING_REFERENCE', () => {
      const tx = createREFUND();
      tx.markPendingReference();
      expect(tx.status).toBe(WagerTransactionStatus.PENDING_REFERENCE);
    });

    it('reject transitions to REJECTED', () => {
      const tx = createBET();
      tx.reject(FailureCode.INSUFFICIENT_BALANCE);
      expect(tx.status).toBe(WagerTransactionStatus.REJECTED);
      expect(tx.failureCode).toBe(FailureCode.INSUFFICIENT_BALANCE);
    });

    it('fail transitions to FAILED', () => {
      const tx = createBET();
      tx.fail(FailureCode.WALLET_NOT_FOUND);
      expect(tx.status).toBe(WagerTransactionStatus.FAILED);
      expect(tx.failureCode).toBe(FailureCode.WALLET_NOT_FOUND);
    });

    it('cannot transition from terminal state', () => {
      const tx = createBET();
      tx.markProcessed(undefined, new Date());
      expect(() => tx.reject(FailureCode.INSUFFICIENT_BALANCE)).toThrow();
    });
  });

  describe('isReversal()', () => {
    it('REFUND is a reversal', () => {
      expect(createREFUND().isReversal()).toBe(true);
    });

    it('ROLLBACK is a reversal', () => {
      expect(createROLLBACK().isReversal()).toBe(true);
    });

    it('BET is not a reversal', () => {
      expect(createBET().isReversal()).toBe(false);
    });
  });

  describe('ledgerDirectionFor()', () => {
    it('BET returns DEBIT', () => {
      expect(createBET().ledgerDirectionFor()).toBe('DEBIT');
    });

    it('WIN returns CREDIT', () => {
      const tx = WagerTransaction.create({
        id: '550e8400-e29b-41d4-a716-446655440005',
        providerId: 'provider-a',
        externalTransactionId: 'win-1',
        idempotencyKey: 'provider-a:win-1',
        payloadHash: 'win-hash',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.WIN,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });
      expect(tx.ledgerDirectionFor()).toBe('CREDIT');
    });

    it('ROLLBACK inverts reference direction', () => {
      const rollback = createROLLBACK();
      const bet = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'provider-a:ext-1',
        payloadHash: 'abc123',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: { amount: '25.00', currency: 'BRL' },
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });
      expect(rollback.ledgerDirectionFor(bet)).toBe('CREDIT');
    });

    it('ROLLBACK of WIN returns DEBIT', () => {
      const rollback = createROLLBACK();
      const win = WagerTransaction.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440005',
        providerId: 'provider-a',
        externalTransactionId: 'win-1',
        idempotencyKey: 'provider-a:win-1',
        payloadHash: 'win-hash',
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        playerId: '550e8400-e29b-41d4-a716-446655440002',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.WIN,
        money: { amount: '25.00', currency: 'BRL' },
        status: WagerTransactionStatus.PROCESSED,
        createdAt: new Date(),
      });
      expect(rollback.ledgerDirectionFor(win)).toBe('DEBIT');
    });
  });
});
