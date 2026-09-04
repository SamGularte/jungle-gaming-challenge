import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { setupTestDb, createTestWallet, createTransactionService, cleanupTestDb } from './helpers/test-setup';
import { WagerTransactionStatus } from '../../wagering/domain/aggregates/wager-transaction';
import { WagerTransactionRepository } from '../../wagering/infrastructure/persistence/repositories/wager-transaction.repository';

describe('Concorrência - Referências', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await orm.close();
  });

  beforeEach(async () => {
    await cleanupTestDb(orm);
  });

  it('REFUND entregue antes da referência deve ficar PENDING_REFERENCE', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '1000.00');
    const service = createTransactionService(orm);

    const refundResult = await service.process({
      idempotencyKey: 'refund:before',
      providerId: 'provider-a',
      externalTransactionId: 'refund-1',
      playerId,
      walletId: wallet.id,
      roundId: 'round-ref',
      gameId: 'game-ref',
      kind: 'REFUND',
      money: { amount: '25.00', currency: 'BRL' },
      referenceExternalTransactionId: 'bet-1',
    });

    expect(refundResult.status).toBe(WagerTransactionStatus.PENDING_REFERENCE);

    const txRepo = new WagerTransactionRepository(orm.em.fork());
    const found = await txRepo.findById(refundResult.transactionId);
    expect(found?.status).toBe(WagerTransactionStatus.PENDING_REFERENCE);

    const betResult = await service.process({
      idempotencyKey: 'ref:bet-1',
      providerId: 'provider-a',
      externalTransactionId: 'bet-1',
      playerId,
      walletId: wallet.id,
      roundId: 'round-ref',
      gameId: 'game-ref',
      kind: 'BET',
      money: { amount: '25.00', currency: 'BRL' },
    });

    expect(betResult.status).toBe(WagerTransactionStatus.PROCESSED);

    const refundAfter = await txRepo.findById(refundResult.transactionId);
    expect(refundAfter?.status).toBe(WagerTransactionStatus.PENDING_REFERENCE);
  });

  it('ROLLBACK entregue antes da referência deve ficar PENDING_REFERENCE', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '1000.00');
    const service = createTransactionService(orm);

    const rollbackResult = await service.process({
      idempotencyKey: 'rollback:before',
      providerId: 'provider-a',
      externalTransactionId: 'rollback-1',
      playerId,
      walletId: wallet.id,
      roundId: 'round-rollback',
      gameId: 'game-rollback',
      kind: 'ROLLBACK',
      money: { amount: '50.00', currency: 'BRL' },
      referenceExternalTransactionId: 'win-1',
    });

    expect(rollbackResult.status).toBe(WagerTransactionStatus.PENDING_REFERENCE);

    const txRepo = new WagerTransactionRepository(orm.em.fork());
    const found = await txRepo.findById(rollbackResult.transactionId);
    expect(found?.status).toBe(WagerTransactionStatus.PENDING_REFERENCE);
  });

  it('REFUND e BET concorrentes para o mesmo externalId', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '500.00');
    const service = createTransactionService(orm);

    const [betResult, refundResult] = await Promise.allSettled([
      service.process({
        idempotencyKey: 'both:bet',
        providerId: 'provider-a',
        externalTransactionId: 'ext-both',
        playerId,
        walletId: wallet.id,
        roundId: 'round-both',
        gameId: 'game-both',
        kind: 'BET',
        money: { amount: '100.00', currency: 'BRL' },
      }),
      service.process({
        idempotencyKey: 'both:refund',
        providerId: 'provider-a',
        externalTransactionId: 'refund-both',
        playerId,
        walletId: wallet.id,
        roundId: 'round-both',
        gameId: 'game-both',
        kind: 'REFUND',
        money: { amount: '100.00', currency: 'BRL' },
        referenceExternalTransactionId: 'ext-both',
      }),
    ]);

    const bet = betResult.status === 'fulfilled' ? betResult.value : null;
    const refund = refundResult.status === 'fulfilled' ? refundResult.value : null;

    expect(bet).not.toBeNull();
    expect(refund).not.toBeNull();

    const betProcessed = bet!.status === WagerTransactionStatus.PROCESSED;
    const refundPending = refund!.status === WagerTransactionStatus.PENDING_REFERENCE;

    expect(betProcessed || refundPending).toBe(true);

    if (betProcessed && refundPending) {
      const txRepo = new WagerTransactionRepository(orm.em.fork());
      const refundTx = await txRepo.findById(refund!.transactionId);
      expect(refundTx?.status).toBe(WagerTransactionStatus.PENDING_REFERENCE);
    }
  });
});
