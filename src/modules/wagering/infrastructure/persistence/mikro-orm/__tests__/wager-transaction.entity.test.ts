import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { WagerTransactionEntitySchema, WagerTransactionEntity } from '../entities/wager-transaction.entity';
import { WalletEntitySchema, WalletEntity } from '../../../../../wallet/infrastructure/persistence/mikro-orm/entities/wallet.entity';

describe('WagerTransactionEntity (MikroORM v7)', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      clientUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jungle_gaming',
      entities: [WalletEntitySchema, WagerTransactionEntitySchema],
      debug: false,
    });
    await orm.schema.create();
  });

  afterAll(async () => {
    await orm.schema.drop();
    await orm.close();
  });

  beforeEach(async () => {
    await orm.em.nativeDelete(WagerTransactionEntity, {});
    await orm.em.nativeDelete(WalletEntity, {});
  });

  describe('criação', () => {
    it('deve criar uma transação BET com sucesso', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef37',
        playerId: 'player-001',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const transaction = new WagerTransactionEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef38',
        providerId: 'provider-a',
        externalTransactionId: 'ext-001',
        idempotencyKey: 'provider-a:ext-001',
        payloadHash: 'a'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-001',
        roundId: 'round-001',
        gameId: 'game-001',
        kind: 'BET',
        amount: '25.00',
        currency: 'BRL',
        status: 'PENDING',
      });

      await em.persist(transaction).flush();

      const saved = await em.findOne(WagerTransactionEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef38',
      });

      expect(saved).toBeDefined();
      expect(saved?.providerId).toBe('provider-a');
      expect(saved?.kind).toBe('BET');
      expect(saved?.amount).toBe('25.00');
      expect(saved?.status).toBe('PENDING');
    });

    it('deve criar transação WIN com referência', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef39',
        playerId: 'player-002',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const transaction = new WagerTransactionEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef40',
        providerId: 'provider-a',
        externalTransactionId: 'ext-002',
        idempotencyKey: 'provider-a:ext-002',
        payloadHash: 'b'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-002',
        roundId: 'round-002',
        gameId: 'game-002',
        kind: 'WIN',
        amount: '50.00',
        currency: 'BRL',
        status: 'PENDING',
        referenceExternalTransactionId: 'ext-001',
      });

      await em.persist(transaction).flush();

      const saved = await em.findOne(WagerTransactionEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef40',
      });

      expect(saved?.kind).toBe('WIN');
      expect(saved?.referenceExternalTransactionId).toBe('ext-001');
    });
  });

  describe('transições de status', () => {
    it('deve marcar transação como PROCESSED', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef47',
        playerId: 'player-006',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const transaction = new WagerTransactionEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef48',
        providerId: 'provider-a',
        externalTransactionId: 'ext-006',
        idempotencyKey: 'provider-a:ext-006',
        payloadHash: 'f'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-006',
        roundId: 'round-006',
        gameId: 'game-006',
        kind: 'BET',
        amount: '25.00',
        currency: 'BRL',
        status: 'PENDING',
      });

      await em.persist(transaction).flush();

      const now = new Date();
      transaction.markProcessed('ref-001', now);
      await em.flush();

      const saved = await em.findOne(WagerTransactionEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef48',
      });

      expect(saved?.status).toBe('PROCESSED');
      expect(saved?.referenceTransactionId).toBe('ref-001');
      expect(saved?.processedAt).toBeDefined();
    });

    it('deve marcar transação como REJECTED', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef49',
        playerId: 'player-007',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const transaction = new WagerTransactionEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef50',
        providerId: 'provider-a',
        externalTransactionId: 'ext-007',
        idempotencyKey: 'provider-a:ext-007',
        payloadHash: 'g'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-007',
        roundId: 'round-007',
        gameId: 'game-007',
        kind: 'BET',
        amount: '25.00',
        currency: 'BRL',
        status: 'PENDING',
      });

      await em.persist(transaction).flush();

      const now = new Date();
      transaction.markRejected('INSUFFICIENT_BALANCE', now);
      await em.flush();

      const saved = await em.findOne(WagerTransactionEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef50',
      });

      expect(saved?.status).toBe('REJECTED');
      expect(saved?.failureCode).toBe('INSUFFICIENT_BALANCE');
    });

    it('deve marcar transação como FAILED', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef51',
        playerId: 'player-008',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const transaction = new WagerTransactionEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef52',
        providerId: 'provider-a',
        externalTransactionId: 'ext-008',
        idempotencyKey: 'provider-a:ext-008',
        payloadHash: 'h'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-008',
        roundId: 'round-008',
        gameId: 'game-008',
        kind: 'BET',
        amount: '25.00',
        currency: 'BRL',
        status: 'PENDING',
      });

      await em.persist(transaction).flush();

      const now = new Date();
      transaction.markFailed('MAX_RETRIES_EXCEEDED', now);
      await em.flush();

      const saved = await em.findOne(WagerTransactionEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef52',
      });

      expect(saved?.status).toBe('FAILED');
      expect(saved?.failureCode).toBe('MAX_RETRIES_EXCEEDED');
    });

    it('deve marcar transação como PENDING_REFERENCE', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef53',
        playerId: 'player-009',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const transaction = new WagerTransactionEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef54',
        providerId: 'provider-a',
        externalTransactionId: 'ext-009',
        idempotencyKey: 'provider-a:ext-009',
        payloadHash: 'i'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-009',
        roundId: 'round-009',
        gameId: 'game-009',
        kind: 'REFUND',
        amount: '25.00',
        currency: 'BRL',
        status: 'PENDING',
        referenceExternalTransactionId: 'ext-001',
      });

      await em.persist(transaction).flush();

      transaction.markPendingReference();
      await em.flush();

      const saved = await em.findOne(WagerTransactionEntity, {
        id: '0192f291-27dd-7d3f-8071-5f8685deef54',
      });

      expect(saved?.status).toBe('PENDING_REFERENCE');
    });
  });

  describe('invariantes do banco', () => {
    it('deve rejeitar idempotencyKey duplicada', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef55',
        playerId: 'player-010',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const transaction1 = new WagerTransactionEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef56',
        providerId: 'provider-a',
        externalTransactionId: 'ext-010',
        idempotencyKey: 'same-key',
        payloadHash: 'j'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-010',
        roundId: 'round-010',
        gameId: 'game-010',
        kind: 'BET',
        amount: '25.00',
        currency: 'BRL',
        status: 'PENDING',
      });

      await em.persist(transaction1).flush();

      const transaction2 = new WagerTransactionEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef57',
        providerId: 'provider-a',
        externalTransactionId: 'ext-011',
        idempotencyKey: 'same-key',
        payloadHash: 'k'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-010',
        roundId: 'round-010',
        gameId: 'game-010',
        kind: 'BET',
        amount: '50.00',
        currency: 'BRL',
        status: 'PENDING',
      });

      await expect(em.persist(transaction2).flush()).rejects.toThrow();
    });

    it('deve rejeitar (providerId, externalTransactionId) duplicado', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef58',
        playerId: 'player-011',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const transaction1 = new WagerTransactionEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef59',
        providerId: 'provider-a',
        externalTransactionId: 'ext-012',
        idempotencyKey: 'provider-a:ext-012',
        payloadHash: 'l'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-011',
        roundId: 'round-011',
        gameId: 'game-011',
        kind: 'BET',
        amount: '25.00',
        currency: 'BRL',
        status: 'PENDING',
      });

      await em.persist(transaction1).flush();

      const transaction2 = new WagerTransactionEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef60',
        providerId: 'provider-a',
        externalTransactionId: 'ext-012',
        idempotencyKey: 'provider-a:ext-013',
        payloadHash: 'm'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-011',
        roundId: 'round-011',
        gameId: 'game-011',
        kind: 'BET',
        amount: '50.00',
        currency: 'BRL',
        status: 'PENDING',
      });

      await expect(em.persist(transaction2).flush()).rejects.toThrow();
    });

    it('deve rejeitar kind inválido (CHECK)', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef61',
        playerId: 'player-012',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const transaction = new WagerTransactionEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef62',
        providerId: 'provider-a',
        externalTransactionId: 'ext-014',
        idempotencyKey: 'provider-a:ext-014',
        payloadHash: 'n'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-012',
        roundId: 'round-012',
        gameId: 'game-012',
        kind: 'INVALID',
        amount: '25.00',
        currency: 'BRL',
        status: 'PENDING',
      });

      await expect(em.persist(transaction).flush()).rejects.toThrow();
    });

    it('deve rejeitar currency inválida (CHECK)', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef65',
        playerId: 'player-014',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      const transaction = new WagerTransactionEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef66',
        providerId: 'provider-a',
        externalTransactionId: 'ext-016',
        idempotencyKey: 'provider-a:ext-016',
        payloadHash: 'p'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-014',
        roundId: 'round-014',
        gameId: 'game-014',
        kind: 'BET',
        amount: '25.00',
        currency: 'XXX',
        status: 'PENDING',
      });

      await expect(em.persist(transaction).flush()).rejects.toThrow();
    });
  });

  describe('índices', () => {
    it('deve ter índices para consultas eficientes', async () => {
      const em = orm.em.fork();

      const wallet = new WalletEntity({
        id: '0192f291-27dd-7d3f-8071-5f8685deef67',
        playerId: 'player-015',
        currency: 'BRL',
        balance: '100.00',
        version: 1,
      });
      await em.persist(wallet).flush();

      for (let i = 0; i < 10; i++) {
        const transaction = new WagerTransactionEntity({
          id: `0192f291-27dd-7d3f-8071-5f8685deef6${i}`,
          providerId: 'provider-a',
          externalTransactionId: `ext-${i}`,
          idempotencyKey: `provider-a:ext-${i}`,
          payloadHash: 'a'.repeat(64),
          walletId: wallet.id,
          playerId: 'player-015',
          roundId: `round-${i}`,
          gameId: 'game-015',
          kind: 'BET',
          amount: '10.00',
          currency: 'BRL',
          status: i % 2 === 0 ? 'PENDING' : 'PROCESSED',
        });
        await em.persist(transaction).flush();
      }

      const byWallet = await em.find(WagerTransactionEntity, { walletId: wallet.id });
      expect(byWallet).toHaveLength(10);

      const byStatus = await em.find(WagerTransactionEntity, { status: 'PENDING' });
      expect(byStatus.length).toBeGreaterThan(0);
    });
  });
});
