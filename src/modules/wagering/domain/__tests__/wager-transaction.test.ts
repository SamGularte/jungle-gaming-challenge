import { describe, it, expect, beforeEach } from 'bun:test';
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
  FailureCode,
  InvalidTransactionError,
  InvalidTransactionStateError,
} from '../aggregates/wager-transaction';
import { Money } from '../../../wallet/domain/value-objects/money';

describe('WagerTransaction', () => {
  describe('create()', () => {
    it('deve criar BET', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      expect(tx.kind).toBe(WagerTransactionKind.BET);
      expect(tx.status).toBe(WagerTransactionStatus.PENDING);
      expect(tx.requiresReference()).toBe(false);
      expect(tx.affectsBalance()).toBe(true);
    });

    it('deve criar WIN sem referência', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.WIN,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
      });

      expect(tx.kind).toBe(WagerTransactionKind.WIN);
      expect(tx.affectsBalance()).toBe(true);
    });

    it('deve criar WIN com referência', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.WIN,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'bet-123',
      });

      expect(tx.referenceExternalTransactionId).toBe('bet-123');
    });

    it('deve criar LOSS', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.LOSS,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      expect(tx.affectsBalance()).toBe(false);
      expect(tx.ledgerDirectionFor()).toBeNull();
    });

    it('deve criar REFUND com referência', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.REFUND,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'bet-123',
      });

      expect(tx.kind).toBe(WagerTransactionKind.REFUND);
      expect(tx.requiresReference()).toBe(true);
      expect(tx.affectsBalance()).toBe(true);
    });

    it('deve criar ROLLBACK com referência', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.ROLLBACK,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'win-123',
      });

      expect(tx.kind).toBe(WagerTransactionKind.ROLLBACK);
      expect(tx.requiresReference()).toBe(true);
      expect(tx.affectsBalance()).toBe(true);
    });

    it('deve rejeitar OPENING', () => {
      expect(() => {
        WagerTransaction.create({
          id: 'tx-123',
          providerId: 'provider-a',
          externalTransactionId: 'ext-123',
          idempotencyKey: 'provider-a:ext-123',
          payloadHash: 'hash-abc',
          walletId: 'wallet-123',
          playerId: 'player-456',
          roundId: 'round-789',
          gameId: 'game-001',
          kind: WagerTransactionKind.OPENING,
          money: Money.from({ amount: '1000.00', currency: 'BRL' }),
        });
      }).toThrow(InvalidTransactionError);
    });

    it('deve rejeitar REFUND sem referência', () => {
      expect(() => {
        WagerTransaction.create({
          id: 'tx-123',
          providerId: 'provider-a',
          externalTransactionId: 'ext-123',
          idempotencyKey: 'provider-a:ext-123',
          payloadHash: 'hash-abc',
          walletId: 'wallet-123',
          playerId: 'player-456',
          roundId: 'round-789',
          gameId: 'game-001',
          kind: WagerTransactionKind.REFUND,
          money: Money.from({ amount: '25.00', currency: 'BRL' }),
        });
      }).toThrow(InvalidTransactionError);
    });

    it('deve rejeitar ROLLBACK sem referência', () => {
      expect(() => {
        WagerTransaction.create({
          id: 'tx-123',
          providerId: 'provider-a',
          externalTransactionId: 'ext-123',
          idempotencyKey: 'provider-a:ext-123',
          payloadHash: 'hash-abc',
          walletId: 'wallet-123',
          playerId: 'player-456',
          roundId: 'round-789',
          gameId: 'game-001',
          kind: WagerTransactionKind.ROLLBACK,
          money: Money.from({ amount: '50.00', currency: 'BRL' }),
        });
      }).toThrow(InvalidTransactionError);
    });
  });

  describe('rehydrate()', () => {
    it('deve reconstruir transação do estado persistido', () => {
      const now = new Date();
      const tx = WagerTransaction.rehydrate({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.BET,
        money: { amount: '25.00', currency: 'BRL' },
        createdAt: now,
        status: WagerTransactionStatus.PROCESSED,
        referenceTransactionId: 'ref-123',
        processedAt: now,
      });

      expect(tx.status).toBe(WagerTransactionStatus.PROCESSED);
      expect(tx.referenceTransactionId).toBe('ref-123');
      expect(tx.processedAt).toBe(now);
    });
  });

  describe('transições de estado', () => {
    it('markProcessed() deve marcar como PROCESSED', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      tx.markProcessed(undefined, new Date());
      expect(tx.status).toBe(WagerTransactionStatus.PROCESSED);
      expect(tx.isTerminal()).toBe(true);
    });

    it('markPendingReference() deve marcar como PENDING_REFERENCE', () => {
      const refund = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.REFUND,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'bet-123',
      });

      refund.markPendingReference();
      expect(refund.status).toBe(WagerTransactionStatus.PENDING_REFERENCE);
    });

    it('reject() deve marcar como REJECTED', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      tx.reject(FailureCode.INSUFFICIENT_BALANCE);
      expect(tx.status).toBe(WagerTransactionStatus.REJECTED);
      expect(tx.failureCode).toBe(FailureCode.INSUFFICIENT_BALANCE);
      expect(tx.isTerminal()).toBe(true);
      expect(tx.affectsBalance()).toBe(false);
    });

    it('fail() deve marcar como FAILED', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      tx.fail(FailureCode.MAX_RETRIES_EXCEEDED);
      expect(tx.status).toBe(WagerTransactionStatus.FAILED);
      expect(tx.failureCode).toBe(FailureCode.MAX_RETRIES_EXCEEDED);
      expect(tx.isTerminal()).toBe(true);
      expect(tx.affectsBalance()).toBe(false);
    });

    it('deve rejeitar transição de estado terminal', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      tx.markProcessed(undefined, new Date());

      expect(() => {
        tx.reject(FailureCode.INSUFFICIENT_BALANCE);
      }).toThrow(InvalidTransactionStateError);
    });
  });

  describe('consultas de domínio', () => {
    it('affectsBalance() - LOSS não afeta, BET afeta', () => {
      const bet = WagerTransaction.create({
        id: 'tx-1',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      const loss = WagerTransaction.create({
        id: 'tx-2',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.LOSS,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      expect(bet.affectsBalance()).toBe(true);
      expect(loss.affectsBalance()).toBe(false);
    });

    it('requiresReference() - REFUND/ROLLBACK exigem referência', () => {
      const bet = WagerTransaction.create({
        id: 'tx-1',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      const refund = WagerTransaction.create({
        id: 'tx-2',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.REFUND,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'bet-123',
      });

      expect(bet.requiresReference()).toBe(false);
      expect(refund.requiresReference()).toBe(true);
    });

    it('matchesPayload() deve comparar hashes', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'hash-abc',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      expect(tx.matchesPayload('hash-abc')).toBe(true);
      expect(tx.matchesPayload('hash-def')).toBe(false);
    });

    it('isReversal() - REFUND/ROLLBACK são reversões', () => {
      const bet = WagerTransaction.create({
        id: 'tx-1',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      const refund = WagerTransaction.create({
        id: 'tx-2',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.REFUND,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'bet-123',
      });

      expect(bet.isReversal()).toBe(false);
      expect(refund.isReversal()).toBe(true);
    });

    it('isTerminal() - PROCESSED/REJECTED/FAILED são terminais', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      expect(tx.isTerminal()).toBe(false);
      tx.markProcessed(undefined, new Date());
      expect(tx.isTerminal()).toBe(true);
    });
  });

  describe('isValidReference()', () => {
    let bet: WagerTransaction;
    let win: WagerTransaction;
    let refund: WagerTransaction;
    let loss: WagerTransaction;

    beforeEach(() => {
      bet = WagerTransaction.create({
        id: 'bet-123',
        providerId: 'p',
        externalTransactionId: 'bet-123',
        idempotencyKey: 'p:bet-123',
        payloadHash: 'h1',
        walletId: 'w-123',
        playerId: 'pl-456',
        roundId: 'r-789',
        gameId: 'g-001',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });
      bet.markProcessed(undefined, new Date());

      win = WagerTransaction.create({
        id: 'win-123',
        providerId: 'p',
        externalTransactionId: 'win-123',
        idempotencyKey: 'p:win-123',
        payloadHash: 'h2',
        walletId: 'w-123',
        playerId: 'pl-456',
        roundId: 'r-789',
        gameId: 'g-001',
        kind: WagerTransactionKind.WIN,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
      });
      win.markProcessed(undefined, new Date());

      refund = WagerTransaction.create({
        id: 'refund-123',
        providerId: 'p',
        externalTransactionId: 'refund-123',
        idempotencyKey: 'p:refund-123',
        payloadHash: 'h3',
        walletId: 'w-123',
        playerId: 'pl-456',
        roundId: 'r-789',
        gameId: 'g-001',
        kind: WagerTransactionKind.REFUND,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'bet-123',
      });
      refund.markProcessed('bet-123', new Date());

      loss = WagerTransaction.create({
        id: 'loss-123',
        providerId: 'p',
        externalTransactionId: 'loss-123',
        idempotencyKey: 'p:loss-123',
        payloadHash: 'h4',
        walletId: 'w-123',
        playerId: 'pl-456',
        roundId: 'r-789',
        gameId: 'g-001',
        kind: WagerTransactionKind.LOSS,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });
      loss.markProcessed(undefined, new Date());
    });

    it('REFUND deve aceitar BET', () => {
      expect(refund.isValidReference(bet)).toBe(true);
    });

    it('REFUND deve rejeitar WIN', () => {
      expect(refund.isValidReference(win)).toBe(false);
    });

    it('ROLLBACK deve aceitar BET, WIN ou REFUND', () => {
      const rollbackBet = WagerTransaction.create({
        id: 'rollback-bet',
        providerId: 'p',
        externalTransactionId: 'rollback-bet',
        idempotencyKey: 'p:rollback-bet',
        payloadHash: 'h5',
        walletId: 'w-123',
        playerId: 'pl-456',
        roundId: 'r-789',
        gameId: 'g-001',
        kind: WagerTransactionKind.ROLLBACK,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'bet-123',
      });

      const rollbackWin = WagerTransaction.create({
        id: 'rollback-win',
        providerId: 'p',
        externalTransactionId: 'rollback-win',
        idempotencyKey: 'p:rollback-win',
        payloadHash: 'h6',
        walletId: 'w-123',
        playerId: 'pl-456',
        roundId: 'r-789',
        gameId: 'g-001',
        kind: WagerTransactionKind.ROLLBACK,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'win-123',
      });

      const rollbackRefund = WagerTransaction.create({
        id: 'rollback-refund',
        providerId: 'p',
        externalTransactionId: 'rollback-refund',
        idempotencyKey: 'p:rollback-refund',
        payloadHash: 'h7',
        walletId: 'w-123',
        playerId: 'pl-456',
        roundId: 'r-789',
        gameId: 'g-001',
        kind: WagerTransactionKind.ROLLBACK,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'refund-123',
      });

      expect(rollbackBet.isValidReference(bet)).toBe(true);
      expect(rollbackWin.isValidReference(win)).toBe(true);
      expect(rollbackRefund.isValidReference(refund)).toBe(true);
    });

    it('ROLLBACK deve rejeitar LOSS', () => {
      const rollback = WagerTransaction.create({
        id: 'rollback-123',
        providerId: 'p',
        externalTransactionId: 'rollback-123',
        idempotencyKey: 'p:rollback-123',
        payloadHash: 'h5',
        walletId: 'w-123',
        playerId: 'pl-456',
        roundId: 'r-789',
        gameId: 'g-001',
        kind: WagerTransactionKind.ROLLBACK,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'loss-123',
      });

      expect(rollback.isValidReference(loss)).toBe(false);
    });
  });

  describe('ledgerDirectionFor()', () => {
    it('BET deve retornar DEBIT', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      expect(tx.ledgerDirectionFor()).toBe('DEBIT');
    });

    it('WIN e REFUND devem retornar CREDIT', () => {
      const win = WagerTransaction.create({
        id: 'win-123',
        providerId: 'p',
        externalTransactionId: 'win-123',
        idempotencyKey: 'p:win-123',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.WIN,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
      });

      const refund = WagerTransaction.create({
        id: 'refund-123',
        providerId: 'p',
        externalTransactionId: 'refund-123',
        idempotencyKey: 'p:refund-123',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.REFUND,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'bet-123',
      });

      expect(win.ledgerDirectionFor()).toBe('CREDIT');
      expect(refund.ledgerDirectionFor()).toBe('CREDIT');
    });

    it('LOSS deve retornar null', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.LOSS,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      expect(tx.ledgerDirectionFor()).toBeNull();
    });

    it('ROLLBACK deve inverter direção da referência', () => {
      const reference = WagerTransaction.create({
        id: 'ref-123',
        providerId: 'p',
        externalTransactionId: 'win-123',
        idempotencyKey: 'p:win-123',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.WIN,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
      });

      const rollback = WagerTransaction.create({
        id: 'rollback-123',
        providerId: 'p',
        externalTransactionId: 'rollback-123',
        idempotencyKey: 'p:rollback-123',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.ROLLBACK,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'win-123',
      });

      expect(rollback.ledgerDirectionFor(reference)).toBe('DEBIT');
    });

    it('ROLLBACK sem referência deve lançar erro', () => {
      const rollback = WagerTransaction.create({
        id: 'rollback-123',
        providerId: 'p',
        externalTransactionId: 'rollback-123',
        idempotencyKey: 'p:rollback-123',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.ROLLBACK,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'win-123',
      });

      expect(() => {
        rollback.ledgerDirectionFor();
      }).toThrow(InvalidTransactionError);
    });
  });

  describe('casos de uso - seção 7 do desafio', () => {
    it('BET: débito com rejeição por saldo insuficiente', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      tx.reject(FailureCode.INSUFFICIENT_BALANCE);
      expect(tx.status).toBe(WagerTransactionStatus.REJECTED);
      expect(tx.failureCode).toBe(FailureCode.INSUFFICIENT_BALANCE);
      expect(tx.affectsBalance()).toBe(false);
      expect(tx.ledgerDirectionFor()).toBeNull();
    });

    it('WIN: crédito', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.WIN,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
      });

      expect(tx.ledgerDirectionFor()).toBe('CREDIT');
      expect(tx.affectsBalance()).toBe(true);
    });

    it('LOSS: não afeta saldo', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.LOSS,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      expect(tx.affectsBalance()).toBe(false);
      expect(tx.ledgerDirectionFor()).toBeNull();
    });

    it('REFUND: crédito revertendo BET', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'p',
        externalTransactionId: 'e',
        idempotencyKey: 'p:e',
        payloadHash: 'h',
        walletId: 'w',
        playerId: 'pl',
        roundId: 'r',
        gameId: 'g',
        kind: WagerTransactionKind.REFUND,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'bet-123',
      });

      expect(tx.ledgerDirectionFor()).toBe('CREDIT');
      expect(tx.affectsBalance()).toBe(true);
    });
  });

  describe('serialização', () => {
    it('toJSON() deve serializar para JSON', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      const json = tx.toJSON();
      expect(json.id).toBe('tx-123');
      expect(json.providerId).toBe('provider-a');
      expect(json.kind).toBe(WagerTransactionKind.BET);
      expect(json.status).toBe(WagerTransactionStatus.PENDING);
      expect(json.money).toEqual({ amount: '25.00', currency: 'BRL' });
      expect(json.createdAt).toBeDefined();
    });

    it('toString() deve serializar para string', () => {
      const tx = WagerTransaction.create({
        id: 'tx-123',
        providerId: 'provider-a',
        externalTransactionId: 'ext-123',
        idempotencyKey: 'provider-a:ext-123',
        payloadHash: 'hash-abc',
        walletId: 'wallet-123',
        playerId: 'player-456',
        roundId: 'round-789',
        gameId: 'game-001',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      const str = tx.toString();
      expect(str).toContain('tx-123');
      expect(str).toContain('BET');
      expect(str).toContain('PENDING');
      expect(str).toContain('25.00 BRL');
    });
  });
});
