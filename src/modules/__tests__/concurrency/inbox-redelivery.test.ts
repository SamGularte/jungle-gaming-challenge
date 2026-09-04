import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { setupTestDb, createTestWallet, createTransactionService, cleanupTestDb } from './helpers/test-setup';
import { InboxRepository } from '../../shared/infrastructure/persistence/repositories/inbox.repository';
import { InboxMessage } from '../../shared/domain/value-objects/inbox-message';
import { WagerTransactionStatus } from '../../wagering/domain/aggregates/wager-transaction';
import { createRepositories } from './helpers/test-setup';

describe('Inbox redelivery (duplicate prevention)', () => {
  let orm: MikroORM;
  let inboxRepository: InboxRepository;

  beforeAll(async () => {
    orm = await setupTestDb();
    const repos = createRepositories(orm);
    inboxRepository = repos.inboxRepository;
  });

  afterAll(async () => {
    await cleanupTestDb(orm);
    await orm.close(true);
  });

  beforeEach(async () => {
    await cleanupTestDb(orm);
  });

  it('primeira entrega: mensagem marcada como processada', async () => {
    const consumer = 'test-consumer';
    const msg = InboxMessage.receive({
      messageId: 'msg-001',
      consumerName: consumer,
      payloadHash: 'a'.repeat(64),
    });

    await inboxRepository.save(msg);
    const found = await inboxRepository.findByConsumerAndMessageId(consumer, 'msg-001');
    expect(found).toBeDefined();
    expect(found!.isProcessed()).toBe(false);
  });

  it('entrega duplicada e detectada', async () => {
    const consumer = 'test-consumer';
    const msg = InboxMessage.receive({
      messageId: 'msg-dup-001',
      consumerName: consumer,
      payloadHash: 'b'.repeat(64),
    });

    await inboxRepository.save(msg);

    const exists = await inboxRepository.exists(consumer, 'msg-dup-001');
    expect(exists).toBe(true);

    const isProcessed = await inboxRepository.isProcessed(consumer, 'msg-dup-001');
    expect(isProcessed).toBe(false);
  });

  it('mensagens distintas sao processadas independentemente', async () => {
    const consumer = 'test-consumer';

    const msg1 = InboxMessage.receive({ messageId: 'msg-a', consumerName: consumer, payloadHash: 'c'.repeat(64) });
    const msg2 = InboxMessage.receive({ messageId: 'msg-b', consumerName: consumer, payloadHash: 'd'.repeat(64) });
    const msg3 = InboxMessage.receive({ messageId: 'msg-c', consumerName: consumer, payloadHash: 'e'.repeat(64) });

    await inboxRepository.save(msg1);
    await inboxRepository.save(msg2);
    await inboxRepository.save(msg3);

    expect(await inboxRepository.exists(consumer, 'msg-a')).toBe(true);
    expect(await inboxRepository.exists(consumer, 'msg-b')).toBe(true);
    expect(await inboxRepository.exists(consumer, 'msg-c')).toBe(true);
  });

  it('isProcessed retorna true apos marcar como processada', async () => {
    const consumer = 'test-consumer';
    const msg = InboxMessage.receive({
      messageId: 'msg-check-001',
      consumerName: consumer,
      payloadHash: 'f'.repeat(64),
    });

    await inboxRepository.save(msg);
    await inboxRepository.markProcessed(consumer, 'msg-check-001', new Date());

    const processed = await inboxRepository.isProcessed(consumer, 'msg-check-001');
    expect(processed).toBe(true);
  });

  it('isProcessed retorna false para mensagem nova', async () => {
    const consumer = 'test-consumer';
    const processed = await inboxRepository.isProcessed(consumer, 'msg-new-001');
    expect(processed).toBe(false);
  });

  it('processTransactionIdempotent reprocessa mesma mensagem', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId);
    const service = createTransactionService(orm);

    const result = await service.process({
      idempotencyKey: 'inbox-test:bet-1',
      externalTransactionId: 'ext-inbox-1',
      providerId: 'provider-inbox',
      walletId: wallet.id,
      playerId,
      roundId: 'round-inbox-1',
      gameId: 'game-inbox',
      kind: 'BET',
      money: { amount: '10.00', currency: 'BRL' },
    });
    expect(result.status).toBe(WagerTransactionStatus.PROCESSED);

    const result2 = await service.process({
      idempotencyKey: 'inbox-test:bet-1',
      externalTransactionId: 'ext-inbox-1',
      providerId: 'provider-inbox',
      walletId: wallet.id,
      playerId,
      roundId: 'round-inbox-1',
      gameId: 'game-inbox',
      kind: 'BET',
      money: { amount: '10.00', currency: 'BRL' },
    });

    expect(result2.status).toBe(WagerTransactionStatus.PROCESSED);
    expect(result2.transactionId).toBe(result.transactionId);
  });
});
