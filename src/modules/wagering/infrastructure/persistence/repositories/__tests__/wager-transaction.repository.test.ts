import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { WagerTransactionRepository } from '../wager-transaction.repository';
import { WalletRepository } from '../../../../../wallet/infrastructure/persistence/repositories/wallet.repository';
import { WagerTransaction } from '../../../../domain/aggregates/wager-transaction';
import { WagerTransactionKind, WagerTransactionStatus } from '../../../../domain/aggregates/wager-transaction';
import { Money } from '../../../../../wallet/domain/value-objects/money';
import { Wallet } from '../../../../../wallet/domain/aggregates/wallet';
import { WalletEntitySchema, WalletEntity } from '../../../../../wallet/infrastructure/persistence/mikro-orm/entities/wallet.entity';
import { WagerTransactionEntitySchema, WagerTransactionEntity } from '../../mikro-orm/entities/wager-transaction.entity';

describe('WagerTransactionRepository', () => {
  let orm: MikroORM;
  let walletRepository: WalletRepository;
  let transactionRepository: WagerTransactionRepository;

  beforeAll(async () => {
    orm = await MikroORM.init({
      clientUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jungle_gaming',
      entities: [WalletEntitySchema, WagerTransactionEntitySchema],
      debug: false,
    });
    await orm.schema.create();
    walletRepository = new WalletRepository(orm.em);
    transactionRepository = new WagerTransactionRepository(orm.em);
  });

  afterAll(async () => {
    await orm.schema.drop();
    await orm.close();
  });

  beforeEach(async () => {
    await orm.em.nativeDelete(WagerTransactionEntity, {});
    await orm.em.nativeDelete(WalletEntity, {});
  });

  describe('save()', () => {
    it('deve salvar uma transação BET', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef37',
        playerId: 'player-001',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const transaction = WagerTransaction.create({
        id: '0192f291-27dd-7d3f-8071-5f8685deef38',
        providerId: 'provider-a',
        externalTransactionId: 'ext-001',
        idempotencyKey: 'provider-a:ext-001',
        payloadHash: 'a'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-001',
        roundId: 'round-001',
        gameId: 'game-001',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      await transactionRepository.save(transaction);

      const saved = await transactionRepository.findById(transaction.id);
      expect(saved).toBeDefined();
      expect(saved?.id).toBe(transaction.id);
      expect(saved?.kind).toBe(WagerTransactionKind.BET);
      expect(saved?.status).toBe(WagerTransactionStatus.PENDING);
    });

    it('deve salvar e atualizar uma transação', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef39',
        playerId: 'player-002',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const transaction = WagerTransaction.create({
        id: '0192f291-27dd-7d3f-8071-5f8685deef40',
        providerId: 'provider-a',
        externalTransactionId: 'ext-002',
        idempotencyKey: 'provider-a:ext-002',
        payloadHash: 'b'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-002',
        roundId: 'round-002',
        gameId: 'game-002',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      await transactionRepository.save(transaction);

      transaction.markProcessed(undefined, new Date());
      await transactionRepository.save(transaction);

      const saved = await transactionRepository.findById(transaction.id);
      expect(saved?.status).toBe(WagerTransactionStatus.PROCESSED);
      expect(saved?.processedAt).toBeDefined();
    });
  });

  describe('findByIdempotencyKey()', () => {
    it('deve buscar transação por idempotencyKey', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef41',
        playerId: 'player-003',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const transaction = WagerTransaction.create({
        id: '0192f291-27dd-7d3f-8071-5f8685deef42',
        providerId: 'provider-a',
        externalTransactionId: 'ext-003',
        idempotencyKey: 'unique-key-123',
        payloadHash: 'c'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-003',
        roundId: 'round-003',
        gameId: 'game-003',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      await transactionRepository.save(transaction);

      const found = await transactionRepository.findByIdempotencyKey('unique-key-123');
      expect(found).toBeDefined();
      expect(found?.id).toBe(transaction.id);
    });

    it('deve retornar null para idempotencyKey inexistente', async () => {
      const found = await transactionRepository.findByIdempotencyKey('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('findByProviderAndExternalId()', () => {
    it('deve buscar transação por providerId e externalTransactionId', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef43',
        playerId: 'player-004',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const transaction = WagerTransaction.create({
        id: '0192f291-27dd-7d3f-8071-5f8685deef44',
        providerId: 'provider-a',
        externalTransactionId: 'ext-004',
        idempotencyKey: 'provider-a:ext-004',
        payloadHash: 'd'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-004',
        roundId: 'round-004',
        gameId: 'game-004',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      await transactionRepository.save(transaction);

      const found = await transactionRepository.findByProviderAndExternalId(
        'provider-a',
        'ext-004',
      );
      expect(found).toBeDefined();
      expect(found?.id).toBe(transaction.id);
    });

    it('deve retornar null para combinação inexistente', async () => {
      const found = await transactionRepository.findByProviderAndExternalId(
        'provider-a',
        'nonexistent',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByWalletId()', () => {
    it('deve buscar transações com paginação', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef45',
        playerId: 'player-005',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const transactions: WagerTransaction[] = [];
      for (let i = 0; i < 5; i++) {
        const tx = WagerTransaction.create({
          id: `0192f291-27dd-7d3f-8071-5f8685deef4${i}`,
          providerId: 'provider-a',
          externalTransactionId: `ext-${i}`,
          idempotencyKey: `provider-a:ext-${i}`,
          payloadHash: 'a'.repeat(64),
          walletId: wallet.id,
          playerId: 'player-005',
          roundId: `round-${i}`,
          gameId: 'game-005',
          kind: WagerTransactionKind.BET,
          money: Money.from({ amount: '10.00', currency: 'BRL' }),
        });
        transactions.push(tx);
      }
      await transactionRepository.saveMany(transactions);

      const result = await transactionRepository.findByWalletId(wallet.id, 3);
      expect(result.transactions).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
    });
  });

  describe('findByStatus()', () => {
    it('deve buscar transações por status', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef50',
        playerId: 'player-006',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const tx1 = WagerTransaction.create({
        id: '0192f291-27dd-7d3f-8071-5f8685deef51',
        providerId: 'provider-a',
        externalTransactionId: 'ext-010',
        idempotencyKey: 'provider-a:ext-010',
        payloadHash: 'a'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-006',
        roundId: 'round-010',
        gameId: 'game-006',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });
      await transactionRepository.save(tx1);

      tx1.markProcessed(undefined, new Date());
      await transactionRepository.save(tx1);

      const tx2 = WagerTransaction.create({
        id: '0192f291-27dd-7d3f-8071-5f8685deef52',
        providerId: 'provider-a',
        externalTransactionId: 'ext-011',
        idempotencyKey: 'provider-a:ext-011',
        payloadHash: 'b'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-006',
        roundId: 'round-011',
        gameId: 'game-006',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });
      await transactionRepository.save(tx2);

      const pending = await transactionRepository.findByStatus('PENDING');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(tx2.id);

      const processed = await transactionRepository.findByStatus('PROCESSED');
      expect(processed).toHaveLength(1);
      expect(processed[0].id).toBe(tx1.id);
    });
  });

  describe('findPendingReferences()', () => {
    it('deve buscar transações pendentes de referência', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef53',
        playerId: 'player-007',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const refund = WagerTransaction.create({
        id: '0192f291-27dd-7d3f-8071-5f8685deef54',
        providerId: 'provider-a',
        externalTransactionId: 'refund-001',
        idempotencyKey: 'provider-a:refund-001',
        payloadHash: 'c'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-007',
        roundId: 'round-012',
        gameId: 'game-007',
        kind: WagerTransactionKind.REFUND,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        referenceExternalTransactionId: 'bet-001',
      });
      await transactionRepository.save(refund);

      refund.markPendingReference();
      await transactionRepository.save(refund);

      const pending = await transactionRepository.findPendingReferences();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(refund.id);
      expect(pending[0].status).toBe(WagerTransactionStatus.PENDING_REFERENCE);
    });
  });

  describe('existsByIdempotencyKey()', () => {
    it('deve retornar true se idempotencyKey existe', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef55',
        playerId: 'player-008',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const transaction = WagerTransaction.create({
        id: '0192f291-27dd-7d3f-8071-5f8685deef56',
        providerId: 'provider-a',
        externalTransactionId: 'ext-012',
        idempotencyKey: 'exists-key',
        payloadHash: 'd'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-008',
        roundId: 'round-013',
        gameId: 'game-008',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      await transactionRepository.save(transaction);

      const exists = await transactionRepository.existsByIdempotencyKey('exists-key');
      expect(exists).toBe(true);
    });

    it('deve retornar false se idempotencyKey não existe', async () => {
      const exists = await transactionRepository.existsByIdempotencyKey('nonexistent');
      expect(exists).toBe(false);
    });
  });

  describe('updateStatus()', () => {
    it('deve atualizar o status de uma transação', async () => {
      const wallet = Wallet.open({
        id: '0192f291-27dd-7d3f-8071-5f8685deef57',
        playerId: 'player-009',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      await walletRepository.save(wallet);

      const transaction = WagerTransaction.create({
        id: '0192f291-27dd-7d3f-8071-5f8685deef58',
        providerId: 'provider-a',
        externalTransactionId: 'ext-013',
        idempotencyKey: 'provider-a:ext-013',
        payloadHash: 'e'.repeat(64),
        walletId: wallet.id,
        playerId: 'player-009',
        roundId: 'round-014',
        gameId: 'game-009',
        kind: WagerTransactionKind.BET,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
      });

      await transactionRepository.save(transaction);

      await transactionRepository.updateStatus(transaction.id, 'PROCESSED');

      const saved = await transactionRepository.findById(transaction.id);
      expect(saved?.status).toBe(WagerTransactionStatus.PROCESSED);
    });
  });
});
