import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { setupTestDb, createTestWallet, createTransactionService, cleanupTestDb } from './helpers/test-setup';
import { WalletRepository } from '../../wallet/infrastructure/persistence/repositories/wallet.repository';
import { LedgerRepository } from '../../wallet/infrastructure/persistence/repositories/ledger.repository';
import { WagerTransactionRepository } from '../../wagering/infrastructure/persistence/repositories/wager-transaction.repository';
import { OutboxRepository } from '../../shared/infrastructure/persistence/repositories/outbox.repository';
import { WagerTransactionStatus } from '../../wagering/domain/aggregates/wager-transaction';

describe('Crash Recovery', () => {
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

  it('reinício do serviço mantém consistência final', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '1000.00');
    const service = createTransactionService(orm);

    for (let i = 0; i < 5; i++) {
      await service.process({
        idempotencyKey: `crash:bet-${i}`,
        providerId: 'provider-a',
        externalTransactionId: `bet-${i}`,
        playerId,
        walletId: wallet.id,
        roundId: 'round-crash',
        gameId: 'game-crash',
        kind: 'BET',
        money: { amount: '10.00', currency: 'BRL' },
      });
    }

    const em = orm.em.fork();
    const walletRepo = new WalletRepository(em);
    const ledgerRepo = new LedgerRepository(em);
    const outboxRepo = new OutboxRepository(em);

    const finalWallet = await walletRepo.findById(wallet.id);
    expect(finalWallet?.balance.toJSON()).toEqual({ amount: '950.00', currency: 'BRL' });

    const ledgerEntries = await ledgerRepo.findByWalletId(wallet.id);
    expect(ledgerEntries.entries).toHaveLength(5);

    const outboxPending = await outboxRepo.countPending();
    expect(outboxPending).toBeGreaterThanOrEqual(5);

    const walletBalance = parseFloat(finalWallet?.balance.toAmountString() || '0');
    const ledgerBalance = ledgerEntries.entries.reduce((sum: number, entry: any) => {
      const amount = parseFloat(entry.money.toAmountString());
      return entry.direction === 'DEBIT' ? sum - amount : sum + amount;
    }, 1000);

    expect(ledgerBalance).toBe(walletBalance);
  });

  it('worker morre depois do commit e antes do ack - mensagem é reprocessada', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '1000.00');
    const service = createTransactionService(orm);

    const result = await service.process({
      idempotencyKey: 'worker:crash',
      providerId: 'provider-a',
      externalTransactionId: 'bet-crash',
      playerId,
      walletId: wallet.id,
      roundId: 'round-crash',
      gameId: 'game-crash',
      kind: 'BET',
      money: { amount: '25.00', currency: 'BRL' },
    });

    expect(result.status).toBe(WagerTransactionStatus.PROCESSED);

    const em = orm.em.fork();
    const walletRepo = new WalletRepository(em);
    const finalWallet = await walletRepo.findById(wallet.id);
    expect(finalWallet?.balance.toJSON()).toEqual({ amount: '975.00', currency: 'BRL' });

    const txRepo = new WagerTransactionRepository(em);
    const tx = await txRepo.findById(result.transactionId);
    expect(tx?.status).toBe(WagerTransactionStatus.PROCESSED);
  });

  it('idempotency key previne reprocessamento após reinício', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '1000.00');
    const service1 = createTransactionService(orm);

    const result1 = await service1.process({
      idempotencyKey: 'idempotent:bet',
      providerId: 'provider-a',
      externalTransactionId: 'bet-idempotent',
      playerId,
      walletId: wallet.id,
      roundId: 'round-idempotent',
      gameId: 'game-idempotent',
      kind: 'BET',
      money: { amount: '50.00', currency: 'BRL' },
    });

    expect(result1.status).toBe(WagerTransactionStatus.PROCESSED);

    const service2 = createTransactionService(orm);

    const result2 = await service2.process({
      idempotencyKey: 'idempotent:bet',
      providerId: 'provider-a',
      externalTransactionId: 'bet-idempotent',
      playerId,
      walletId: wallet.id,
      roundId: 'round-idempotent',
      gameId: 'game-idempotent',
      kind: 'BET',
      money: { amount: '50.00', currency: 'BRL' },
    });

    expect(result2.status).toBe(WagerTransactionStatus.PROCESSED);
    expect(result2.idempotentReplay).toBe(true);

    const em = orm.em.fork();
    const walletRepo = new WalletRepository(em);
    const finalWallet = await walletRepo.findById(wallet.id);
    expect(finalWallet?.balance.toJSON()).toEqual({ amount: '950.00', currency: 'BRL' });
  });

  it('mensagens outbox persistem entre reinícios', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '1000.00');
    const service = createTransactionService(orm);

    await service.process({
      idempotencyKey: 'outbox:bet',
      providerId: 'provider-a',
      externalTransactionId: 'bet-outbox',
      playerId,
      walletId: wallet.id,
      roundId: 'round-outbox',
      gameId: 'game-outbox',
      kind: 'BET',
      money: { amount: '30.00', currency: 'BRL' },
    });

    const em = orm.em.fork();
    const outboxRepo = new OutboxRepository(em);
    const pendingMessages = await outboxRepo.findPendingDue();
    expect(pendingMessages.length).toBeGreaterThanOrEqual(1);

    const service2 = createTransactionService(orm);
    await service2.process({
      idempotencyKey: 'outbox:bet',
      providerId: 'provider-a',
      externalTransactionId: 'bet-outbox',
      playerId,
      walletId: wallet.id,
      roundId: 'round-outbox',
      gameId: 'game-outbox',
      kind: 'BET',
      money: { amount: '30.00', currency: 'BRL' },
    });

    const em2 = orm.em.fork();
    const outboxRepo2 = new OutboxRepository(em2);
    const pendingAfter = await outboxRepo2.findPendingDue();
    expect(pendingAfter.length).toBeGreaterThanOrEqual(1);
  });
});
