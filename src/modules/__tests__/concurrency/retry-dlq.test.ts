import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { setupTestDb, createTestWallet, createTransactionService, createRepositories, cleanupTestDb } from './helpers/test-setup';
import { WagerTransactionStatus, WagerTransactionKind, WagerTransaction } from '../../wagering/domain/aggregates/wager-transaction';
import { Money } from '../../wallet/domain/value-objects/money';

describe('Retry / DLQ flow', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb(orm);
    await orm.close(true);
  });

  beforeEach(async () => {
    await cleanupTestDb(orm);
  });

  it('REFUND com referencia inexistente entra em PENDING_REFERENCE', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '100.00');
    const service = createTransactionService(orm);

    const result = await service.process({
      idempotencyKey: 'pending-ref:1',
      externalTransactionId: 'ext-pending-1',
      providerId: 'provider-p',
      walletId: wallet.id,
      playerId,
      roundId: 'round-p',
      gameId: 'game-p',
      kind: 'REFUND',
      money: { amount: '50.00', currency: 'BRL' },
      referenceExternalTransactionId: 'nonexistent-ref-1',
    });

    expect(result.status).toBe(WagerTransactionStatus.PENDING_REFERENCE);
  });

  it('retry worker incrementa retryCount', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '100.00');
    const service = createTransactionService(orm);
    const repos = createRepositories(orm);

    await service.process({
      idempotencyKey: 'retry-test:1',
      externalTransactionId: 'ext-retry-1',
      providerId: 'provider-r',
      walletId: wallet.id,
      playerId,
      roundId: 'round-r',
      gameId: 'game-r',
      kind: 'REFUND',
      money: { amount: '25.00', currency: 'BRL' },
      referenceExternalTransactionId: 'nonexistent-retry-1',
    });

    const pending = await repos.transactionRepository.findPendingReferences(10);
    expect(pending.length).toBe(1);

    const txBefore = pending[0];
    expect(txBefore.retryCount).toBe(0);

    txBefore.incrementRetry();
    await repos.transactionRepository.save(txBefore);

    const txAfter = await repos.transactionRepository.findById(txBefore.id);
    expect(txAfter?.retryCount).toBe(1);
  });

  it('tx com maxRetries excedido para de ser processada', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '100.00');
    const repos = createRepositories(orm);

    const tx = WagerTransaction.create({
      id: crypto.randomUUID(),
      providerId: 'provider-max',
      externalTransactionId: 'ext-max-1',
      idempotencyKey: 'max-retry-test:1',
      payloadHash: 'hash-max-1',
      walletId: wallet.id,
      playerId,
      roundId: 'round-max',
      gameId: 'game-max',
      kind: WagerTransactionKind.REFUND,
      money: Money.from({ amount: '30.00', currency: 'BRL' }),
      referenceExternalTransactionId: 'nonexistent-max',
    });

    tx.markPendingReference();
    for (let i = 0; i < 5; i++) {
      tx.incrementRetry();
    }
    expect(tx.hasExceededMaxRetries(5)).toBe(true);

    await repos.transactionRepository.save(tx);

    const pending = await repos.transactionRepository.findPendingReferences(10);
    const found = pending.find((p) => p.id === tx.id);
    expect(found).toBeUndefined();
  });

  it('REFUND com referencia existente e wallets distintas entra em PENDING_REFERENCE', async () => {
    const playerId = crypto.randomUUID();
    const walletA = await createTestWallet(orm, playerId, '100.00');
    const walletB = await createTestWallet(orm, playerId, '50.00', 'USD');
    const service = createTransactionService(orm);

    await service.process({
      idempotencyKey: 'cross-wallet:bet',
      externalTransactionId: 'ext-cross-1',
      providerId: 'provider-cross',
      walletId: walletA.id,
      playerId,
      roundId: 'round-cross',
      gameId: 'game-cross',
      kind: 'BET',
      money: { amount: '20.00', currency: 'BRL' },
    });

    const result = await service.process({
      idempotencyKey: 'cross-wallet:refund',
      externalTransactionId: 'ext-cross-2',
      providerId: 'provider-cross',
      walletId: walletB.id,
      playerId,
      roundId: 'round-cross',
      gameId: 'game-cross',
      kind: 'REFUND',
      money: { amount: '20.00', currency: 'BRL' },
      referenceExternalTransactionId: 'ext-cross-1',
    });

    expect(result.status).toBe(WagerTransactionStatus.PENDING_REFERENCE);
  });
});
