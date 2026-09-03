import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { OutboxMessageEntitySchema, OutboxMessageEntity } from '../entities/outbox-message.entity';

describe('OutboxMessageEntity (MikroORM v7)', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      clientUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jungle_gaming',
      entities: [OutboxMessageEntitySchema],
      debug: false,
      allowGlobalContext: true,
    });
    await orm.schema.drop();
    await orm.schema.create();
  });

  afterAll(async () => {
    await orm.schema.drop();
    await orm.close();
  });

  beforeEach(async () => {
    await orm.em.getConnection().execute('DELETE FROM outbox_messages');
  });

  describe('criação', () => {
    it('deve criar uma mensagem com sucesso', async () => {
      const em = orm.em.fork();

      const message = new OutboxMessageEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef37',
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: {
          walletId: 'wallet-123',
          balance: { amount: '100.00', currency: 'BRL' },
        },
      });

      await em.persist(message).flush();

      const saved = await em.findOne(OutboxMessageEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef37',
      });

      expect(saved).toBeDefined();
      expect(saved?.aggregateId).toBe('0192f291-27dd-7d3f-8071-5f8685deef01');
      expect(saved?.eventType).toBe('WalletBalanceChanged');
      expect(saved?.payload).toEqual({
        walletId: 'wallet-123',
        balance: { amount: '100.00', currency: 'BRL' },
      });
      expect(saved?.attempts).toBe(0);
      expect(saved?.isPending()).toBe(true);
      expect(saved?.publishedAt).toBeNull();
    });

    it('deve criar mensagem com nextAttemptAt definido', async () => {
      const em = orm.em.fork();

      const now = new Date();
      const message = new OutboxMessageEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef38',
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
        nextAttemptAt: now,
      });

      await em.persist(message).flush();

      const saved = await em.findOne(OutboxMessageEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef38',
      });

      expect(saved?.nextAttemptAt?.toISOString()).toBe(now.toISOString());
    });

    it('deve criar mensagem com publishedAt definido', async () => {
      const em = orm.em.fork();

      const now = new Date();
      const message = new OutboxMessageEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef39',
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
        publishedAt: now,
      });

      await em.persist(message).flush();

      const saved = await em.findOne(OutboxMessageEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef39',
      });

      expect(saved?.isPending()).toBe(false);
      expect(saved?.publishedAt?.toISOString()).toBe(now.toISOString());
    });
  });

  describe('markPublished()', () => {
    it('deve marcar mensagem como publicada', async () => {
      const em = orm.em.fork();

      const message = new OutboxMessageEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef40',
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      await em.persist(message).flush();

      const now = new Date();
      message.markPublished(now);
      await em.flush();

      const saved = await em.findOne(OutboxMessageEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef40',
      });

      expect(saved?.isPending()).toBe(false);
      expect(saved?.publishedAt?.toISOString()).toBe(now.toISOString());
    });
  });

  describe('scheduleRetry()', () => {
    it('deve agendar retry com backoff exponencial', async () => {
      const em = orm.em.fork();

      const message = new OutboxMessageEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef41',
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      await em.persist(message).flush();

      const now = new Date();
      message.scheduleRetry(now);
      await em.flush();

      const saved = await em.findOne(OutboxMessageEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef41',
      });

      expect(saved?.attempts).toBe(1);
      expect(saved?.nextAttemptAt).toBeDefined();

      const expectedDelay = 2000;
      const actualDelay = saved!.nextAttemptAt!.getTime() - now.getTime();
      expect(actualDelay).toBeGreaterThanOrEqual(expectedDelay - 10);
      expect(actualDelay).toBeLessThanOrEqual(expectedDelay + 10);
    });

    it('deve incrementar attempts a cada retry', async () => {
      const em = orm.em.fork();

      const message = new OutboxMessageEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef42',
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      await em.persist(message).flush();

      const now = new Date();

      message.scheduleRetry(now);
      expect(message.attempts).toBe(1);

      message.scheduleRetry(now);
      expect(message.attempts).toBe(2);

      message.scheduleRetry(now);
      expect(message.attempts).toBe(3);
    });
  });

  describe('consultas', () => {
    it('isPending() deve retornar true para mensagem não publicada', async () => {
      const em = orm.em.fork();

      const message = new OutboxMessageEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef43',
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      await em.persist(message).flush();

      const saved = await em.findOne(OutboxMessageEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef43',
      });

      expect(saved?.isPending()).toBe(true);
    });

    it('isDue() deve retornar true quando nextAttemptAt <= now', async () => {
      const em = orm.em.fork();

      const now = new Date();
      const past = new Date(now.getTime() - 1000);

      const message = new OutboxMessageEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef45',
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
        nextAttemptAt: past,
      });

      await em.persist(message).flush();

      const saved = await em.findOne(OutboxMessageEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef45',
      });

      expect(saved?.isDue(now)).toBe(true);
    });

    it('isDue() deve retornar false quando nextAttemptAt > now', async () => {
      const em = orm.em.fork();

      const now = new Date();
      const future = new Date(now.getTime() + 1000);

      const message = new OutboxMessageEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef46',
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
        nextAttemptAt: future,
      });

      await em.persist(message).flush();

      const saved = await em.findOne(OutboxMessageEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef46',
      });

      expect(saved?.isDue(now)).toBe(false);
    });

    it('hasExceededMaxAttempts() deve retornar true quando attempts >= max', async () => {
      const em = orm.em.fork();

      const message = new OutboxMessageEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef48',
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
        attempts: 10,
      });

      await em.persist(message).flush();

      const saved = await em.findOne(OutboxMessageEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef48',
      });

      expect(saved?.hasExceededMaxAttempts(10)).toBe(true);
    });
  });

  describe('invariantes do banco', () => {
    it('deve rejeitar attempts negativo (CHECK)', async () => {
      const em = orm.em.fork();

      const message = new OutboxMessageEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef49',
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
        attempts: -1,
      });

      await expect(em.persist(message).flush()).rejects.toThrow();
    });

    it('deve permitir payload JSON complexo', async () => {
      const em = orm.em.fork();

      const complexPayload = {
        walletId: 'wallet-123',
        transactionId: 'tx-456',
        direction: 'DEBIT',
        money: { amount: '25.00', currency: 'BRL' },
        balanceBefore: { amount: '100.00', currency: 'BRL' },
        balanceAfter: { amount: '75.00', currency: 'BRL' },
        walletVersion: 2,
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' },
        },
      };

      const message = new OutboxMessageEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef50',
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: complexPayload,
      });

      await em.persist(message).flush();
    });
  });
});
