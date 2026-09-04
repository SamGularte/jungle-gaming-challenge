import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { setupTestDb, cleanupTestDb } from './helpers/test-setup';

describe('DB constraint violations', () => {
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

  it('UUID fora do formato e rejeitado pelo CHECK constraint', async () => {
    const em = orm.em.fork();
    const invalidUuid = 'not-a-valid-uuid';

    try {
      await em.execute(
        `INSERT INTO wallets (id, player_id, balance, currency, version, status, created_at, updated_at) VALUES ('${invalidUuid}', '${crypto.randomUUID()}', '100.00', 'BRL', 1, 'ACTIVE', NOW(), NOW())`,
      );
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toMatch(/invalid input syntax for type uuid/i);
    }
  });

  it('amount fora do formato decimal e rejeitado', async () => {
    const em = orm.em.fork();
    const walletId = crypto.randomUUID();
    const playerId = crypto.randomUUID();

    try {
      await em.execute(
        `INSERT INTO wallets (id, player_id, balance, currency, version, status, created_at, updated_at) VALUES ('${walletId}', '${playerId}', 'abc.not-a-number', 'BRL', 1, 'ACTIVE', NOW(), NOW())`,
      );
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toMatch(/invalid input syntax for type numeric/i);
    }
  });

  it('violation do ledger_arithmetic_check: DEBIT com saldo incorreto', async () => {
    const em = orm.em.fork();
    const walletId = crypto.randomUUID();
    const playerId = crypto.randomUUID();

    await em.execute(
      `INSERT INTO wallets (id, player_id, balance, currency, version, status, created_at, updated_at) VALUES ('${walletId}', '${playerId}', '100.00', 'BRL', 1, 'ACTIVE', NOW(), NOW())`,
    );

    try {
      await em.execute(
        `INSERT INTO ledger_entries (id, wallet_id, transaction_id, direction, amount, currency, balance_before, balance_after, created_at) VALUES ('${crypto.randomUUID()}', '${walletId}', '${crypto.randomUUID()}', 'DEBIT', '50.00', 'BRL', '100.00', '30.00', NOW())`,
      );
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toMatch(/ledger_arithmetic_check|check constraint/i);
    }
  });

  it('violation do ledger_arithmetic_check: CREDIT incorreto', async () => {
    const em = orm.em.fork();
    const walletId = crypto.randomUUID();
    const playerId = crypto.randomUUID();

    await em.execute(
      `INSERT INTO wallets (id, player_id, balance, currency, version, status, created_at, updated_at) VALUES ('${walletId}', '${playerId}', '0.00', 'BRL', 1, 'ACTIVE', NOW(), NOW())`,
    );

    try {
      await em.execute(
        `INSERT INTO ledger_entries (id, wallet_id, transaction_id, direction, amount, currency, balance_before, balance_after, created_at) VALUES ('${crypto.randomUUID()}', '${walletId}', '${crypto.randomUUID()}', 'CREDIT', '50.00', 'BRL', '0.00', '100.00', NOW())`,
      );
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toMatch(/ledger_arithmetic_check|check constraint/i);
    }
  });

  it('kind invalido na wager_transactions e rejeitado pelo CHECK', async () => {
    const em = orm.em.fork();

    try {
      await em.execute(
        `INSERT INTO wager_transactions (id, provider_id, external_transaction_id, idempotency_key, payload_hash, wallet_id, player_id, round_id, game_id, kind, amount, currency, status, created_at) VALUES ('${crypto.randomUUID()}', 'p', 'e', 'i', 'h', '${crypto.randomUUID()}', '${crypto.randomUUID()}', 'r', 'g', 'INVALID_KIND', '10.00', 'BRL', 'PENDING', NOW())`,
      );
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toMatch(/check constraint|invalid input value/i);
    }
  });

  it('status invalido na wager_transactions e rejeitado pelo CHECK', async () => {
    const em = orm.em.fork();

    try {
      await em.execute(
        `INSERT INTO wager_transactions (id, provider_id, external_transaction_id, idempotency_key, payload_hash, wallet_id, player_id, round_id, game_id, kind, amount, currency, status, created_at) VALUES ('${crypto.randomUUID()}', 'p', 'e', 'i', 'h', '${crypto.randomUUID()}', '${crypto.randomUUID()}', 'r', 'g', 'BET', '10.00', 'BRL', 'INVALID_STATUS', NOW())`,
      );
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toMatch(/check constraint|invalid input value/i);
    }
  });

  it('currency vazia e rejeitada', async () => {
    const em = orm.em.fork();
    const walletId = crypto.randomUUID();
    const playerId = crypto.randomUUID();

    try {
      await em.execute(
        `INSERT INTO wallets (id, player_id, balance, currency, version, status, created_at, updated_at) VALUES ('${walletId}', '${playerId}', '100.00', '', 1, 'ACTIVE', NOW(), NOW())`,
      );
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toMatch(/violates|constraint|check/i);
    }
  });

  it('amount negativo em wager_transactions e rejeitado', async () => {
    const em = orm.em.fork();

    try {
      await em.execute(
        `INSERT INTO wager_transactions (id, provider_id, external_transaction_id, idempotency_key, payload_hash, wallet_id, player_id, round_id, game_id, kind, amount, currency, status, created_at) VALUES ('${crypto.randomUUID()}', 'p', 'e', 'i', 'h', '${crypto.randomUUID()}', '${crypto.randomUUID()}', 'r', 'g', 'BET', '-10.00', 'BRL', 'PENDING', NOW())`,
      );
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toMatch(/wager_amount_non_negative|check constraint/i);
    }
  });
});
