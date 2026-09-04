import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { setupTestDb, createTestWallet, cleanupTestDb, assertWalletBalanceEqualsLedger } from './helpers/test-setup';
import { WalletRepository } from '../../wallet/infrastructure/persistence/repositories/wallet.repository';
import { LedgerRepository } from '../../wallet/infrastructure/persistence/repositories/ledger.repository';
import { WagerTransactionRepository } from '../../wagering/infrastructure/persistence/repositories/wager-transaction.repository';
import { OutboxRepository } from '../../shared/infrastructure/persistence/repositories/outbox.repository';
import { TransactionService } from '../../wagering/application/services/transaction.service';
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

describe('Concorrência - Wallet', () => {
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

  it('≥ 3 processos/instâncias simultâneos disputando a mesma wallet', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '200.00');
    const processCount = 3;

    const results = await Promise.allSettled(
      Array.from({ length: processCount }, (_, i) => {
        const service = createService(orm);
        return service.process({
          idempotencyKey: `multi:bet-${i}`,
          providerId: 'provider-a',
          externalTransactionId: `bet-${i}`,
          playerId,
          walletId: wallet.id,
          roundId: 'round-multi',
          gameId: 'game-multi',
          kind: 'BET',
          money: { amount: '80.00', currency: 'BRL' },
        });
      }),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(processCount);

    const processed = fulfilled.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 'PROCESSED',
    );
    const rejected = fulfilled.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 'REJECTED',
    );

    expect(processed.length + rejected.length).toBe(processCount);
    expect(processed.length).toBeGreaterThanOrEqual(1);

    const em = orm.em.fork();
    const walletRepo = new WalletRepository(em);
    const finalWallet = await walletRepo.findById(wallet.id);
    expect(finalWallet).toBeDefined();

    const ledgerRepo = new LedgerRepository(em);
    const entries = await ledgerRepo.findByWalletId(wallet.id);
    expect(entries.entries).toHaveLength(processed.length);

    const totalDebited = entries.entries.reduce(
      (sum, e) => sum + parseFloat(e.money.toAmountString()),
      0,
    );
    expect(totalDebited).toBe(processed.length * 80);

    await assertWalletBalanceEqualsLedger(orm, wallet.id);
  });

  it('operações de débito e crédito concorrentes na mesma wallet', async () => {
    const playerId = crypto.randomUUID();
    const wallet = await createTestWallet(orm, playerId, '500.00');

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => {
        const service = createService(orm);
        const isDebit = i % 2 === 0;
        return service.process({
          idempotencyKey: `mixed:${i}`,
          providerId: 'provider-a',
          externalTransactionId: `op-${i}`,
          playerId,
          walletId: wallet.id,
          roundId: 'round-mixed',
          gameId: 'game-mixed',
          kind: isDebit ? 'BET' : 'WIN',
          money: { amount: '50.00', currency: 'BRL' },
        });
      }),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(6);

    const em = orm.em.fork();
    const walletRepo = new WalletRepository(em);
    const finalWallet = await walletRepo.findById(wallet.id);
    expect(finalWallet).toBeDefined();
    expect(finalWallet!.balance.isNegative()).toBe(false);

    const ledgerRepo = new LedgerRepository(em);
    const entries = await ledgerRepo.findByWalletId(wallet.id);
    expect(entries.entries.length).toBeGreaterThan(0);

    for (const entry of entries.entries) {
      expect(entry.isBalanced()).toBe(true);
    }

    await assertWalletBalanceEqualsLedger(orm, wallet.id);
  });

  it('wallets distintas processadas em paralelo (20 wallets)', async () => {
    const walletCount = 20;
    const wallets = [];

    for (let i = 0; i < walletCount; i++) {
      const w = await createTestWallet(orm, crypto.randomUUID(), '500.00');
      wallets.push(w);
    }

    const results = await Promise.allSettled(
      wallets.map((w, i) => {
        const service = createService(orm);
        return service.process({
          idempotencyKey: `dist-${i}`,
          providerId: 'provider-a',
          externalTransactionId: `bet-${i}`,
          playerId: w.playerId,
          walletId: w.id,
          roundId: 'round-dist',
          gameId: 'game-dist',
          kind: 'BET',
          money: { amount: '100.00', currency: 'BRL' },
        });
      }),
    );

    const processed = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 'PROCESSED',
    );
    expect(processed).toHaveLength(walletCount);

    const em = orm.em.fork();
    const walletRepo = new WalletRepository(em);

    for (const w of wallets) {
      const finalWallet = await walletRepo.findById(w.id);
      expect(finalWallet?.balance.toJSON()).toEqual({ amount: '400.00', currency: 'BRL' });
      await assertWalletBalanceEqualsLedger(orm, w.id);
    }
  });
});
