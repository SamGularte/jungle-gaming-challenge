import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { setupTestDb, createTestWallet, cleanupTestDb, assertWalletBalanceEqualsLedger } from './helpers/test-setup';
import { WalletRepository } from '../../wallet/infrastructure/persistence/repositories/wallet.repository';
import { LedgerRepository } from '../../wallet/infrastructure/persistence/repositories/ledger.repository';
import { WagerTransactionRepository } from '../../wagering/infrastructure/persistence/repositories/wager-transaction.repository';
import { OutboxRepository } from '../../shared/infrastructure/persistence/repositories/outbox.repository';
import { TransactionService } from '../../wagering/application/services/transaction.service';
import { WagerTransactionStatus } from '../../wagering/domain/aggregates/wager-transaction';
import { MetricsService } from '../../shared/infrastructure/metrics/metrics.service';

function createService(orm: MikroORM) {
  const em = orm.em.fork();
  return new TransactionService(
    new WagerTransactionRepository(em),
    new WalletRepository(em),
    new LedgerRepository(em),
    new OutboxRepository(em),
    em,
    new MetricsService(),
  );
}

describe('Concorrência - Transações', () => {
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

  it('cenário obrigatório: duas apostas de 80.00 com saldo 100.00', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '100.00');
    const service1 = createService(orm);
    const service2 = createService(orm);

    const [result1, result2] = await Promise.allSettled([
      service1.process({
        idempotencyKey: 'scenario:bet-1',
        providerId: 'provider-a',
        externalTransactionId: 'bet-1',
        playerId,
        walletId: wallet.id,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '80.00', currency: 'BRL' },
      }),
      service2.process({
        idempotencyKey: 'scenario:bet-2',
        providerId: 'provider-a',
        externalTransactionId: 'bet-2',
        playerId,
        walletId: wallet.id,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '80.00', currency: 'BRL' },
      }),
    ]);

    const r1 = result1.status === 'fulfilled' ? result1.value : null;
    const r2 = result2.status === 'fulfilled' ? result2.value : null;

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();

    const statuses = [r1!.status, r2!.status];
    const processed = statuses.filter((s) => s === WagerTransactionStatus.PROCESSED);
    const rejected = statuses.filter((s) => s === WagerTransactionStatus.REJECTED);

    expect(processed).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const em = orm.em.fork();
    const walletRepo = new WalletRepository(em);
    const finalWallet = await walletRepo.findById(wallet.id);
    expect(finalWallet?.balance.toJSON()).toEqual({ amount: '20.00', currency: 'BRL' });
    expect(finalWallet?.version).toBe(2);

    const ledgerRepo = new LedgerRepository(em);
    const entries = await ledgerRepo.findByWalletId(wallet.id);
    expect(entries.entries).toHaveLength(1);
    expect(entries.entries[0].direction).toBe('DEBIT');
    expect(entries.entries[0].money.toJSON()).toEqual({ amount: '80.00', currency: 'BRL' });

    await assertWalletBalanceEqualsLedger(orm, wallet.id);
  });

  it('mesma aposta enviada 50 vezes em paralelo → um único débito', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '1000.00');
    const betCount = 50;

    const results = await Promise.allSettled(
      Array.from({ length: betCount }, (_, i) => {
        const service = createService(orm);
        return service.process({
          idempotencyKey: 'same-bet-50',
          providerId: 'provider-a',
          externalTransactionId: `bet-${i}`,
          playerId,
          walletId: wallet.id,
          roundId: 'round-50',
          gameId: 'game-50',
          kind: 'BET',
          money: { amount: '10.00', currency: 'BRL' },
        });
      }),
    );

    const successful = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === WagerTransactionStatus.PROCESSED,
    );

    expect(successful.length).toBeGreaterThanOrEqual(1);

    const em = orm.em.fork();
    const ledgerRepo = new LedgerRepository(em);
    const entries = await ledgerRepo.findByWalletId(wallet.id);
    expect(entries.entries).toHaveLength(1);

    const walletRepo = new WalletRepository(em);
    const finalWallet = await walletRepo.findById(wallet.id);
    expect(finalWallet?.balance.toJSON()).toEqual({ amount: '990.00', currency: 'BRL' });
    expect(finalWallet?.version).toBe(2);

    await assertWalletBalanceEqualsLedger(orm, wallet.id);
  });

  it('múltiplas apostas concorrentes disputando o mesmo saldo', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '100.00');
    const betCount = 5;

    const results = await Promise.allSettled(
      Array.from({ length: betCount }, (_, i) => {
        const service = createService(orm);
        return service.process({
          idempotencyKey: `race:bet-${i}`,
          providerId: 'provider-a',
          externalTransactionId: `bet-${i}`,
          playerId,
          walletId: wallet.id,
          roundId: 'round-race',
          gameId: 'game-race',
          kind: 'BET',
          money: { amount: '30.00', currency: 'BRL' },
        });
      }),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(betCount);

    const em = orm.em.fork();
    const walletRepo = new WalletRepository(em);
    const finalWallet = await walletRepo.findById(wallet.id);

    expect(finalWallet).toBeDefined();
    expect(finalWallet!.balance.isNegative()).toBe(false);

    const ledgerRepo = new LedgerRepository(em);
    const entries = await ledgerRepo.findByWalletId(wallet.id);

    expect(entries.entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.entries.length).toBeLessThanOrEqual(betCount);

    for (const entry of entries.entries) {
      expect(entry.isBalanced()).toBe(true);
      expect(entry.direction).toBe('DEBIT');
    }

    await assertWalletBalanceEqualsLedger(orm, wallet.id);
  });

  it('wallets distintas processadas em paralelo', async () => {
    const walletCount = 10;
    const wallets = [];

    for (let i = 0; i < walletCount; i++) {
      const w = await createTestWallet(orm, crypto.randomUUID(), '100.00');
      wallets.push(w);
    }

    const results = await Promise.allSettled(
      wallets.map((w, i) => {
        const service = createService(orm);
        return service.process({
          idempotencyKey: `parallel:bet-${i}`,
          providerId: 'provider-a',
          externalTransactionId: `bet-${i}`,
          playerId: w.playerId,
          walletId: w.id,
          roundId: 'round-parallel',
          gameId: 'game-parallel',
          kind: 'BET',
          money: { amount: '25.00', currency: 'BRL' },
        });
      }),
    );

    const processed = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === WagerTransactionStatus.PROCESSED,
    );
    expect(processed).toHaveLength(walletCount);

    const em = orm.em.fork();
    const walletRepo = new WalletRepository(em);

    for (const w of wallets) {
      const finalWallet = await walletRepo.findById(w.id);
      expect(finalWallet?.balance.toJSON()).toEqual({ amount: '75.00', currency: 'BRL' });
      expect(finalWallet?.version).toBe(2);
      await assertWalletBalanceEqualsLedger(orm, w.id);
    }
  });
});
