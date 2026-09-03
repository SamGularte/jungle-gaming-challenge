import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { InboxRepository } from '../inbox.repository';
import { InboxMessage } from '../../../../domain/value-objects/inbox-message';
import { InboxMessageEntity } from '../../mikro-orm/entities/inbox-message.entity';

describe('InboxRepository', () => {
  let orm: MikroORM;
  let repository: InboxRepository;

  beforeAll(async () => {
    orm = await MikroORM.init({
      clientUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jungle_gaming',
      entities: [InboxMessageEntity],
      debug: false,
    });
    await orm.schema.create();
    repository = new InboxRepository(orm.em);
  });

  afterAll(async () => {
    await orm.schema.drop();
    await orm.close();
  });

  beforeEach(async () => {
    await orm.em.nativeDelete(InboxMessageEntity, {});
  });

  describe('save()', () => {
    it('deve salvar uma mensagem', async () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00', currency: 'BRL' });
      const message = InboxMessage.receive({
        messageId: 'msg-001',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });

      await repository.save(message);

      const saved = await repository.findByConsumerAndMessageId(
        'wager-consumer',
        'msg-001',
      );

      expect(saved).toBeDefined();
      expect(saved?.messageId).toBe('msg-001');
      expect(saved?.consumerName).toBe('wager-consumer');
      expect(saved?.payloadHash).toBe(hash);
      expect(saved?.isProcessed()).toBe(false);
    });

    it('deve rejeitar mensagem duplicada (UNIQUE)', async () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00', currency: 'BRL' });
      const message1 = InboxMessage.receive({
        messageId: 'msg-001',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });

      await repository.save(message1);

      const message2 = InboxMessage.receive({
        messageId: 'msg-001',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });

      await expect(repository.save(message2)).rejects.toThrow();
    });
  });

  describe('findByConsumerAndMessageId()', () => {
    it('deve buscar mensagem por consumerName e messageId', async () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00' });
      const message = InboxMessage.receive({
        messageId: 'msg-001',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });

      await repository.save(message);

      const found = await repository.findByConsumerAndMessageId(
        'wager-consumer',
        'msg-001',
      );

      expect(found).toBeDefined();
      expect(found?.messageId).toBe('msg-001');
    });

    it('deve retornar null para mensagem inexistente', async () => {
      const found = await repository.findByConsumerAndMessageId(
        'wager-consumer',
        'nonexistent',
      );
      expect(found).toBeNull();
    });
  });

  describe('isProcessed()', () => {
    it('deve retornar false para mensagem não processada', async () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00' });
      const message = InboxMessage.receive({
        messageId: 'msg-001',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });

      await repository.save(message);

      const processed = await repository.isProcessed('wager-consumer', 'msg-001');
      expect(processed).toBe(false);
    });

    it('deve retornar true para mensagem processada', async () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00' });
      const message = InboxMessage.receive({
        messageId: 'msg-001',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });

      await repository.save(message);
      await repository.markProcessed('wager-consumer', 'msg-001', new Date());

      const processed = await repository.isProcessed('wager-consumer', 'msg-001');
      expect(processed).toBe(true);
    });

    it('deve retornar false para mensagem inexistente', async () => {
      const processed = await repository.isProcessed('wager-consumer', 'nonexistent');
      expect(processed).toBe(false);
    });
  });

  describe('exists()', () => {
    it('deve retornar true se mensagem existe', async () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00' });
      const message = InboxMessage.receive({
        messageId: 'msg-001',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });

      await repository.save(message);

      const exists = await repository.exists('wager-consumer', 'msg-001');
      expect(exists).toBe(true);
    });

    it('deve retornar false se mensagem não existe', async () => {
      const exists = await repository.exists('wager-consumer', 'nonexistent');
      expect(exists).toBe(false);
    });
  });

  describe('findUnprocessedByConsumer()', () => {
    it('deve buscar mensagens não processadas', async () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00' });

      const message1 = InboxMessage.receive({
        messageId: 'msg-001',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });
      await repository.save(message1);

      const message2 = InboxMessage.receive({
        messageId: 'msg-002',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });
      await repository.save(message2);
      await repository.markProcessed('wager-consumer', 'msg-002', new Date());

      const unprocessed = await repository.findUnprocessedByConsumer('wager-consumer');
      expect(unprocessed).toHaveLength(1);
      expect(unprocessed[0].messageId).toBe('msg-001');
    });

    it('deve respeitar o limite', async () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00' });

      for (let i = 0; i < 5; i++) {
        const message = InboxMessage.receive({
          messageId: `msg-${i}`,
          consumerName: 'wager-consumer',
          payloadHash: hash,
        });
        await repository.save(message);
      }

      const unprocessed = await repository.findUnprocessedByConsumer('wager-consumer', 3);
      expect(unprocessed).toHaveLength(3);
    });

    it('deve retornar array vazio para consumer sem mensagens', async () => {
      const unprocessed = await repository.findUnprocessedByConsumer('other-consumer');
      expect(unprocessed).toHaveLength(0);
    });
  });

  describe('markProcessed()', () => {
    it('deve marcar mensagem como processada', async () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00' });
      const message = InboxMessage.receive({
        messageId: 'msg-001',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });

      await repository.save(message);

      const now = new Date();
      await repository.markProcessed('wager-consumer', 'msg-001', now);

      const saved = await repository.findByConsumerAndMessageId(
        'wager-consumer',
        'msg-001',
      );

      expect(saved?.isProcessed()).toBe(true);
      expect(saved?.processedAt?.toISOString()).toBe(now.toISOString());
    });

    it('não deve lançar erro para mensagem inexistente', async () => {
      await expect(
        repository.markProcessed('wager-consumer', 'nonexistent', new Date()),
      ).resolves.not.toThrow();
    });
  });

  describe('countUnprocessed()', () => {
    it('deve contar mensagens não processadas', async () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00' });

      for (let i = 0; i < 3; i++) {
        const message = InboxMessage.receive({
          messageId: `msg-${i}`,
          consumerName: 'wager-consumer',
          payloadHash: hash,
        });
        await repository.save(message);
      }

      await repository.markProcessed('wager-consumer', 'msg-0', new Date());

      const count = await repository.countUnprocessed('wager-consumer');
      expect(count).toBe(2);
    });

    it('deve retornar 0 para consumer sem mensagens', async () => {
      const count = await repository.countUnprocessed('other-consumer');
      expect(count).toBe(0);
    });
  });

  describe('deleteProcessedBefore()', () => {
    it('deve deletar mensagens processadas antigas', async () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00' });

      const oldDate = new Date('2024-01-01');
      const recentDate = new Date('2024-06-01');

      const oldMessage = InboxMessage.receive({
        messageId: 'msg-old',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });
      await repository.save(oldMessage);
      await repository.markProcessed('wager-consumer', 'msg-old', oldDate);

      const recentMessage = InboxMessage.receive({
        messageId: 'msg-recent',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });
      await repository.save(recentMessage);
      await repository.markProcessed('wager-consumer', 'msg-recent', recentDate);

      const unprocessed = InboxMessage.receive({
        messageId: 'msg-unprocessed',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });
      await repository.save(unprocessed);

      const cutoff = new Date('2024-03-01');
      const deleted = await repository.deleteProcessedBefore(cutoff);

      expect(deleted).toBe(1);

      const all = await orm.em.find(InboxMessageEntity, {});
      expect(all).toHaveLength(2);
    });

    it('deve retornar 0 quando não há mensagens para deletar', async () => {
      const deleted = await repository.deleteProcessedBefore(new Date());
      expect(deleted).toBe(0);
    });
  });

  describe('conversão Domain ↔ Entity', () => {
    it('deve preservar todos os campos na conversão', async () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00', currency: 'BRL' });
      const original = InboxMessage.receive({
        messageId: 'msg-001',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });

      await repository.save(original);

      const saved = await repository.findByConsumerAndMessageId(
        'wager-consumer',
        'msg-001',
      );

      expect(saved?.messageId).toBe(original.messageId);
      expect(saved?.consumerName).toBe(original.consumerName);
      expect(saved?.payloadHash).toBe(original.payloadHash);
      expect(saved?.receivedAt.toISOString()).toBe(original.receivedAt.toISOString());
      expect(saved?.isProcessed()).toBe(original.isProcessed());
    });
  });
});
