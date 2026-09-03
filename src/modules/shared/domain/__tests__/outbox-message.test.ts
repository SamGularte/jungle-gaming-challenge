import { describe, it, expect } from 'bun:test';
import {
  OutboxMessage,
  InvalidOutboxMessageError,
  OutboxMessageAlreadyPublishedError,
} from '../value-objects/outbox-message';

describe('OutboxMessage - Value Object', () => {
  describe('enqueue()', () => {
    it('deve criar mensagem com sucesso', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: {
          walletId: 'wallet-123',
          balance: { amount: '100.00', currency: 'BRL' },
        },
      });

      expect(outbox.id).toBeDefined();
      expect(outbox.id.length).toBeGreaterThan(0);
      expect(outbox.aggregateId).toBe('wallet-123');
      expect(outbox.eventType).toBe('WalletBalanceChanged');
      expect(outbox.attempts).toBe(0);
      expect(outbox.isPending()).toBe(true);
      expect(outbox.publishedAt).toBeUndefined();
    });

    it('deve rejeitar aggregateId vazio', () => {
      expect(() => {
        OutboxMessage.enqueue({
          aggregateId: '',
          eventType: 'WalletBalanceChanged',
          payload: { data: 'test' },
        });
      }).toThrow(InvalidOutboxMessageError);
    });

    it('deve rejeitar eventType vazio', () => {
      expect(() => {
        OutboxMessage.enqueue({
          aggregateId: 'wallet-123',
          eventType: '',
          payload: { data: 'test' },
        });
      }).toThrow(InvalidOutboxMessageError);
    });

    it('deve rejeitar payload vazio', () => {
      expect(() => {
        OutboxMessage.enqueue({
          aggregateId: 'wallet-123',
          eventType: 'WalletBalanceChanged',
          payload: {},
        });
      }).toThrow(InvalidOutboxMessageError);
    });

    it('deve rejeitar payload null', () => {
      expect(() => {
        OutboxMessage.enqueue({
          aggregateId: 'wallet-123',
          eventType: 'WalletBalanceChanged',
          payload: null as any,
        });
      }).toThrow(InvalidOutboxMessageError);
    });

    it('deve rejeitar eventType com formato inválido', () => {
      expect(() => {
        OutboxMessage.enqueue({
          aggregateId: 'wallet-123',
          eventType: 'Wallet-Balance-Changed',
          payload: { data: 'test' },
        });
      }).toThrow(InvalidOutboxMessageError);
    });

    it('deve aceitar eventType em camelCase', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'walletBalanceChanged',
        payload: { data: 'test' },
      });

      expect(outbox.eventType).toBe('walletBalanceChanged');
    });

    it('deve definir nextAttemptAt como data atual', () => {
      const before = new Date();
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });
      const after = new Date();

      expect(outbox.nextAttemptAt).toBeDefined();
      expect(outbox.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(outbox.nextAttemptAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('rehydrate()', () => {
    it('deve reconstruir mensagem do estado persistido', () => {
      const now = new Date();
      const nextAttempt = new Date(now.getTime() + 1000);
      const publishedAt = new Date(now.getTime() + 2000);

      const outbox = OutboxMessage.rehydrate({
        id: 'outbox-123',
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
        occurredAt: now,
        attempts: 3,
        nextAttemptAt: nextAttempt,
        publishedAt: publishedAt,
      });

      expect(outbox.id).toBe('outbox-123');
      expect(outbox.aggregateId).toBe('wallet-123');
      expect(outbox.attempts).toBe(3);
      expect(outbox.nextAttemptAt).toBe(nextAttempt);
      expect(outbox.publishedAt).toBe(publishedAt);
      expect(outbox.isPending()).toBe(false);
    });

    it('deve reconstruir mensagem pendente', () => {
      const now = new Date();

      const outbox = OutboxMessage.rehydrate({
        id: 'outbox-123',
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
        occurredAt: now,
        attempts: 0,
        nextAttemptAt: now,
      });

      expect(outbox.isPending()).toBe(true);
      expect(outbox.publishedAt).toBeUndefined();
    });
  });

  describe('consultas', () => {
    it('isPending() deve retornar true para mensagem não publicada', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      expect(outbox.isPending()).toBe(true);
    });

    it('isPending() deve retornar false para mensagem publicada', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      outbox.markPublished(new Date());
      expect(outbox.isPending()).toBe(false);
    });

    it('isDue() deve retornar true para mensagem sem nextAttemptAt', () => {
      const outbox = OutboxMessage.rehydrate({
        id: 'outbox-123',
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
        occurredAt: new Date(),
        attempts: 0,
      });

      expect(outbox.isDue(new Date())).toBe(true);
    });

    it('isDue() deve retornar true quando nextAttemptAt <= now', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000);

      const outbox = OutboxMessage.rehydrate({
        id: 'outbox-123',
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
        occurredAt: new Date(),
        attempts: 1,
        nextAttemptAt: past,
      });

      expect(outbox.isDue(now)).toBe(true);
    });

    it('isDue() deve retornar false quando nextAttemptAt > now', () => {
      const now = new Date();
      const future = new Date(now.getTime() + 1000);

      const outbox = OutboxMessage.rehydrate({
        id: 'outbox-123',
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
        occurredAt: new Date(),
        attempts: 1,
        nextAttemptAt: future,
      });

      expect(outbox.isDue(now)).toBe(false);
    });

    it('isDue() deve retornar false para mensagem publicada', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      outbox.markPublished(new Date());
      expect(outbox.isDue(new Date())).toBe(false);
    });

    it('hasExceededMaxAttempts() deve retornar true quando >= max', () => {
      const outbox = OutboxMessage.rehydrate({
        id: 'outbox-123',
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
        occurredAt: new Date(),
        attempts: 10,
      });

      expect(outbox.hasExceededMaxAttempts(10)).toBe(true);
    });

    it('hasExceededMaxAttempts() deve retornar false quando < max', () => {
      const outbox = OutboxMessage.rehydrate({
        id: 'outbox-123',
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
        occurredAt: new Date(),
        attempts: 5,
      });

      expect(outbox.hasExceededMaxAttempts(10)).toBe(false);
    });
  });

  describe('markPublished()', () => {
    it('deve marcar mensagem como publicada', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      const now = new Date();
      outbox.markPublished(now);

      expect(outbox.isPending()).toBe(false);
      expect(outbox.publishedAt).toBe(now);
    });

    it('deve rejeitar marcar mensagem já publicada', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      outbox.markPublished(new Date());

      expect(() => {
        outbox.markPublished(new Date());
      }).toThrow(OutboxMessageAlreadyPublishedError);
    });
  });

  describe('scheduleRetry()', () => {
    it('deve agendar retry com backoff exponencial', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      const now = new Date();
      outbox.scheduleRetry(now);

      expect(outbox.attempts).toBe(1);
      expect(outbox.nextAttemptAt).toBeDefined();

      const expectedDelay = 2000;
      const actualDelay = outbox.nextAttemptAt!.getTime() - now.getTime();
      expect(actualDelay).toBeGreaterThanOrEqual(expectedDelay - 10);
      expect(actualDelay).toBeLessThanOrEqual(expectedDelay + 10);
    });

    it('deve incrementar attempts a cada retry', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      expect(outbox.attempts).toBe(0);

      outbox.scheduleRetry(new Date());
      expect(outbox.attempts).toBe(1);

      outbox.scheduleRetry(new Date());
      expect(outbox.attempts).toBe(2);

      outbox.scheduleRetry(new Date());
      expect(outbox.attempts).toBe(3);
    });

    it('deve aumentar o delay exponencialmente', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      const now = new Date();

      outbox.scheduleRetry(now);
      const delay1 = outbox.nextAttemptAt!.getTime() - now.getTime();
      expect(delay1).toBeGreaterThanOrEqual(1900);
      expect(delay1).toBeLessThanOrEqual(2100);

      outbox.scheduleRetry(now);
      const delay2 = outbox.nextAttemptAt!.getTime() - now.getTime();
      expect(delay2).toBeGreaterThanOrEqual(3900);
      expect(delay2).toBeLessThanOrEqual(4100);

      outbox.scheduleRetry(now);
      const delay3 = outbox.nextAttemptAt!.getTime() - now.getTime();
      expect(delay3).toBeGreaterThanOrEqual(7900);
      expect(delay3).toBeLessThanOrEqual(8100);
    });

    it('deve rejeitar agendar retry de mensagem publicada', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      outbox.markPublished(new Date());

      expect(() => {
        outbox.scheduleRetry(new Date());
      }).toThrow(OutboxMessageAlreadyPublishedError);
    });
  });

  describe('serialização', () => {
    it('toJSON() deve serializar mensagem pendente', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { walletId: 'wallet-123', balance: 100 },
      });

      const json = outbox.toJSON();
      expect(json.id).toBe(outbox.id);
      expect(json.aggregateId).toBe('wallet-123');
      expect(json.eventType).toBe('WalletBalanceChanged');
      expect(json.payload).toEqual({ walletId: 'wallet-123', balance: 100 });
      expect(json.attempts).toBe(0);
      expect(json.publishedAt).toBeUndefined();
    });

    it('toJSON() deve serializar mensagem publicada', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      const now = new Date();
      outbox.markPublished(now);

      const json = outbox.toJSON();
      expect(json.publishedAt).toBe(now.toISOString());
    });

    it('toString() deve serializar para string', () => {
      const outbox = OutboxMessage.enqueue({
        aggregateId: 'wallet-123',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      const str = outbox.toString();
      expect(str).toContain(outbox.id);
      expect(str).toContain('WalletBalanceChanged');
      expect(str).toContain('wallet-123');
      expect(str).toContain('attempts=0');
      expect(str).toContain('published=false');
    });
  });

  describe('calculateNextRetry()', () => {
    it('deve calcular próximo retry com base nas tentativas', () => {
      const now = new Date();

      const retry1 = OutboxMessage.calculateNextRetry(1, now);
      expect(retry1.getTime() - now.getTime()).toBe(2000);

      const retry2 = OutboxMessage.calculateNextRetry(2, now);
      expect(retry2.getTime() - now.getTime()).toBe(4000);

      const retry3 = OutboxMessage.calculateNextRetry(3, now);
      expect(retry3.getTime() - now.getTime()).toBe(8000);
    });
  });
});
