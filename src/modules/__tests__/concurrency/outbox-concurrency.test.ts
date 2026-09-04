import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { setupTestDb, cleanupTestDb } from './helpers/test-setup';
import { OutboxRepository } from '../../shared/infrastructure/persistence/repositories/outbox.repository';
import { OutboxMessage } from '../../shared/domain/value-objects/outbox-message';

describe('Concorrência - Outbox', () => {
  let orm: MikroORM;
  let outboxRepository: OutboxRepository;

  beforeAll(async () => {
    orm = await setupTestDb();
    outboxRepository = new OutboxRepository(orm.em.fork());
  });

  afterAll(async () => {
    await orm.close();
  });

  beforeEach(async () => {
    await cleanupTestDb(orm);
    outboxRepository = new OutboxRepository(orm.em.fork());
  });

  it('dois publishers concorrentes sobre a mesma outbox', async () => {
    const messageCount = 20;
    const messages: OutboxMessage[] = [];

    for (let i = 0; i < messageCount; i++) {
      const msg = OutboxMessage.enqueue({
        aggregateId: crypto.randomUUID(),
        eventType: 'WalletBalanceChanged',
        payload: {
          walletId: crypto.randomUUID(),
          balance: { amount: '100.00', currency: 'BRL' },
        },
      });
      await outboxRepository.save(msg);
      messages.push(msg);
    }

    const pending = await outboxRepository.countPending();
    expect(pending).toBe(messageCount);

    const dueMessages = await outboxRepository.findPendingDue();
    expect(dueMessages.length).toBe(messageCount);

    const [publisher1Results, publisher2Results] = await Promise.all([
      Promise.all(dueMessages.slice(0, 10).map((msg) => outboxRepository.markPublished(msg.id, new Date()))),
      Promise.all(dueMessages.slice(10).map((msg) => outboxRepository.markPublished(msg.id, new Date()))),
    ]);

    const remainingPending = await outboxRepository.countPending();
    expect(remainingPending).toBe(0);

    for (const msg of messages) {
      const found = await outboxRepository.findById(msg.id);
      expect(found?.publishedAt).toBeDefined();
    }
  });

  it('outbox permite retry com backoff exponencial', async () => {
    const msg = OutboxMessage.enqueue({
      aggregateId: crypto.randomUUID(),
      eventType: 'WalletBalanceChanged',
      payload: { data: 'test' },
    });
    await outboxRepository.save(msg);

    await outboxRepository.scheduleRetry(msg.id, new Date());
    const afterRetry1 = await outboxRepository.findById(msg.id);
    expect(afterRetry1?.attempts).toBe(1);
    expect(afterRetry1?.nextAttemptAt).toBeDefined();
    expect(afterRetry1?.isPending()).toBe(true);

    await outboxRepository.scheduleRetry(msg.id, new Date());
    const afterRetry2 = await outboxRepository.findById(msg.id);
    expect(afterRetry2?.attempts).toBe(2);

    const delay1 = afterRetry1!.nextAttemptAt!.getTime() - afterRetry1!.occurredAt.getTime();
    const delay2 = afterRetry2!.nextAttemptAt!.getTime() - afterRetry2!.occurredAt.getTime();
    expect(delay2).toBeGreaterThan(delay1);
  });

  it('mensagem que excede limite de tentativas não é processada', async () => {
    const msg = OutboxMessage.enqueue({
      aggregateId: crypto.randomUUID(),
      eventType: 'WalletBalanceChanged',
      payload: { data: 'test' },
    });
    await outboxRepository.save(msg);

    for (let i = 0; i < 10; i++) {
      await outboxRepository.scheduleRetry(msg.id, new Date());
    }

    const found = await outboxRepository.findById(msg.id);
    expect(found?.hasExceededMaxAttempts(10)).toBe(true);

    const dueMessages = await outboxRepository.findPendingDue();
    const exceeded = dueMessages.filter((m) => m.hasExceededMaxAttempts(10));
    expect(exceeded.length).toBe(0);

    const allExceeded = await outboxRepository.findExceededMaxAttempts(10);
    expect(allExceeded.length).toBe(1);
  });

  it('múltiplos publishers tentando publicar a mesma mensagem', async () => {
    const msg = OutboxMessage.enqueue({
      aggregateId: crypto.randomUUID(),
      eventType: 'WalletBalanceChanged',
      payload: { data: 'test' },
    });
    await outboxRepository.save(msg);

    const publisher1 = outboxRepository.markPublished(msg.id, new Date());
    const publisher2 = outboxRepository.markPublished(msg.id, new Date());

    const results = await Promise.allSettled([publisher1, publisher2]);
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded.length).toBeGreaterThanOrEqual(1);

    const found = await outboxRepository.findById(msg.id);
    expect(found?.publishedAt).toBeDefined();
    expect(found?.isPending()).toBe(false);
  });

  it('deletePublishedBefore limpa mensagens publicadas', async () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 60000);

    for (let i = 0; i < 5; i++) {
      const msg = OutboxMessage.enqueue({
        aggregateId: crypto.randomUUID(),
        eventType: 'WalletBalanceChanged',
        payload: { data: `test-${i}` },
      });
      await outboxRepository.save(msg);
    }

    const dueMessages = await outboxRepository.findPendingDue();
    expect(dueMessages.length).toBe(5);

    for (const msg of dueMessages) {
      await outboxRepository.markPublished(msg.id, oldDate);
    }

    const deleted = await outboxRepository.deletePublishedBefore(now);
    expect(deleted).toBe(5);

    const remaining = await outboxRepository.countPending();
    expect(remaining).toBe(0);
  });
});
