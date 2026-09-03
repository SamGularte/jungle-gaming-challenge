import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { OutboxRepository } from '../outbox.repository';
import { OutboxMessage } from '../../../../domain/value-objects/outbox-message';
import { OutboxMessageEntity } from '../../mikro-orm/entities/outbox-message.entity';

describe('OutboxRepository', () => {
  let orm: MikroORM;
  let repository: OutboxRepository;

  beforeAll(async () => {
    orm = await MikroORM.init({
      clientUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jungle_gaming',
      entities: [OutboxMessageEntity],
      debug: false,
      allowGlobalContext: true,
    });
    await orm.schema.drop();
    await orm.schema.create();
    repository = new OutboxRepository(orm.em.fork());
  });

  afterAll(async () => {
    await orm.schema.drop();
    await orm.close();
  });

  beforeEach(async () => {
    await orm.em.getConnection().execute('DELETE FROM outbox_messages');
  });

  describe('save()', () => {
    it('deve salvar uma mensagem', async () => {
      const message = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: {
          walletId: 'wallet-123',
          balance: { amount: '100.00', currency: 'BRL' },
        },
      });

      await repository.save(message);

      const saved = await repository.findById(message.id);
      expect(saved).toBeDefined();
      expect(saved?.id).toBe(message.id);
      expect(saved?.aggregateId).toBe('0192f291-27dd-7d3f-8071-5f8685deef01');
      expect(saved?.eventType).toBe('WalletBalanceChanged');
      expect(saved?.isPending()).toBe(true);
      expect(saved?.attempts).toBe(0);
    });
  });

  describe('saveMany()', () => {
    it('deve salvar múltiplas mensagens', async () => {
      const messages = [
        OutboxMessage.enqueue({
          aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
          eventType: 'WalletBalanceChanged',
          payload: { data: 'test1' },
        }),
        OutboxMessage.enqueue({
          aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef02',
          eventType: 'WalletBalanceChanged',
          payload: { data: 'test2' },
        }),
      ];

      await repository.saveMany(messages);

      const pending = await repository.countPending();
      expect(pending).toBe(2);
    });
  });

  describe('findPendingDue()', () => {
    it('deve buscar mensagens pendentes prontas', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 10000);

      const message1 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test1' },
      });
      await repository.save(message1);
      await repository.scheduleRetry(message1.id, past);

      const message2 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef02',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test2' },
      });
      await repository.save(message2);
      await repository.scheduleRetry(message2.id, past);

      const message3 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef03',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test3' },
      });
      await repository.save(message3);
      await repository.scheduleRetry(message3.id, new Date(now.getTime() + 1000));

      const message4 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef04',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test4' },
      });
      await repository.save(message4);
      await repository.markPublished(message4.id, now);

      const due = await repository.findPendingDue();
      expect(due).toHaveLength(2);
      expect(due.map((m) => m.id)).toContain(message1.id);
      expect(due.map((m) => m.id)).toContain(message2.id);
    });

    it('deve respeitar o limite', async () => {
      for (let i = 0; i < 5; i++) {
        const message = OutboxMessage.enqueue({
          aggregateId: `0192f291-27dd-7d3f-8071-5f8685deef0${i}`,
          eventType: 'WalletBalanceChanged',
          payload: { data: `test-${i}` },
        });
        await repository.save(message);
      }

      const due = await repository.findPendingDue(3);
      expect(due).toHaveLength(3);
    });
  });

  describe('findPendingByAggregateId()', () => {
    it('deve buscar mensagens pendentes por aggregateId', async () => {
      const message1 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test1' },
      });
      await repository.save(message1);

      const message2 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test2' },
      });
      await repository.save(message2);

      const message3 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef02',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test3' },
      });
      await repository.save(message3);

      await repository.markPublished(message2.id, new Date());

      const pending = await repository.findPendingByAggregateId('0192f291-27dd-7d3f-8071-5f8685deef01');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(message1.id);
    });
  });

  describe('markPublished()', () => {
    it('deve marcar mensagem como publicada', async () => {
      const message = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      await repository.save(message);

      const now = new Date();
      await repository.markPublished(message.id, now);

      const saved = await repository.findById(message.id);
      expect(saved?.isPending()).toBe(false);
      expect(saved?.publishedAt?.toISOString()).toBe(now.toISOString());
    });
  });

  describe('scheduleRetry()', () => {
    it('deve agendar retry com backoff', async () => {
      const message = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test' },
      });

      await repository.save(message);

      const now = new Date();
      await repository.scheduleRetry(message.id, now);

      const saved = await repository.findById(message.id);
      expect(saved?.attempts).toBe(1);
      expect(saved?.nextAttemptAt).toBeDefined();

      const delay = saved!.nextAttemptAt!.getTime() - now.getTime();
      expect(delay).toBeGreaterThanOrEqual(1900);
      expect(delay).toBeLessThanOrEqual(2100);
    });
  });

  describe('countPending()', () => {
    it('deve contar mensagens pendentes', async () => {
      const message1 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test1' },
      });
      await repository.save(message1);

      const message2 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef02',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test2' },
      });
      await repository.save(message2);
      await repository.markPublished(message2.id, new Date());

      const pending = await repository.countPending();
      expect(pending).toBe(1);
    });
  });

  describe('countPendingDue()', () => {
    it('deve contar mensagens pendentes prontas', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 10000);

      const message1 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test1' },
      });
      await repository.save(message1);
      await repository.scheduleRetry(message1.id, past);

      const message2 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef02',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test2' },
      });
      await repository.save(message2);
      await repository.scheduleRetry(message2.id, past);

      const message3 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef03',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test3' },
      });
      await repository.save(message3);
      await repository.scheduleRetry(message3.id, new Date(now.getTime() + 1000));

      const count = await repository.countPendingDue(now);
      expect(count).toBe(2);
    });
  });

  describe('deletePublishedBefore()', () => {
    it('deve deletar mensagens publicadas antigas', async () => {
      const oldDate = new Date('2024-01-01');
      const recentDate = new Date('2024-06-01');

      const message1 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test1' },
      });
      await repository.save(message1);
      await repository.markPublished(message1.id, oldDate);

      const message2 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef02',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test2' },
      });
      await repository.save(message2);
      await repository.markPublished(message2.id, recentDate);

      const message3 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef03',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test3' },
      });
      await repository.save(message3);

      const cutoff = new Date('2024-03-01');
      const deleted = await repository.deletePublishedBefore(cutoff);

      expect(deleted).toBe(1);

      const pending = await repository.countPending();
      expect(pending).toBe(1);
    });
  });

  describe('findExceededMaxAttempts()', () => {
    it('deve buscar mensagens que excederam o limite', async () => {
      const message1 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef01',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test1' },
      });
      await repository.save(message1);
      for (let i = 0; i < 10; i++) {
        await repository.scheduleRetry(message1.id, new Date());
      }

      const message2 = OutboxMessage.enqueue({
        aggregateId: '0192f291-27dd-7d3f-8071-5f8685deef02',
        eventType: 'WalletBalanceChanged',
        payload: { data: 'test2' },
      });
      await repository.save(message2);
      for (let i = 0; i < 5; i++) {
        await repository.scheduleRetry(message2.id, new Date());
      }

      const exceeded = await repository.findExceededMaxAttempts(10);
      expect(exceeded).toHaveLength(1);
      expect(exceeded[0].id).toBe(message1.id);
    });
  });
});
