import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { InboxMessageEntitySchema, InboxMessageEntity } from '../entities/inbox-message.entity';

describe('InboxMessageEntity (MikroORM v7)', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      clientUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jungle_gaming',
      entities: [InboxMessageEntitySchema],
      debug: false,
    });
    await orm.schema.create();
  });

  afterAll(async () => {
    await orm.schema.drop();
    await orm.close();
  });

  beforeEach(async () => {
    await orm.em.nativeDelete(InboxMessageEntity, {});
  });

  describe('criação', () => {
    it('deve criar uma mensagem com sucesso', async () => {
      const em = orm.em.fork();

      const message = new InboxMessageEntity({
        messageId: 'msg-001',
        consumerName: 'wager-consumer',
        payloadHash: 'a'.repeat(64),
      });

      await em.persist(message).flush();

      const saved = await em.findOne(InboxMessageEntity, {
        messageId: 'msg-001',
        consumerName: 'wager-consumer',
      });

      expect(saved).toBeDefined();
      expect(saved?.messageId).toBe('msg-001');
      expect(saved?.consumerName).toBe('wager-consumer');
      expect(saved?.payloadHash).toBe('a'.repeat(64));
      expect(saved?.receivedAt).toBeInstanceOf(Date);
      expect(saved?.processedAt).toBeNull();
    });

    it('deve criar mensagem com processedAt definido', async () => {
      const em = orm.em.fork();

      const now = new Date();
      const message = new InboxMessageEntity({
        messageId: 'msg-002',
        consumerName: 'wager-consumer',
        payloadHash: 'b'.repeat(64),
        processedAt: now,
      });

      await em.persist(message).flush();

      const saved = await em.findOne(InboxMessageEntity, {
        messageId: 'msg-002',
        consumerName: 'wager-consumer',
      });

      expect(saved?.processedAt).toBeDefined();
      expect(saved?.processedAt?.toISOString()).toBe(now.toISOString());
    });
  });

  describe('chave primária composta', () => {
    it('deve permitir mesmo messageId com consumerName diferente', async () => {
      const em = orm.em.fork();

      const message1 = new InboxMessageEntity({
        messageId: 'msg-001',
        consumerName: 'consumer-a',
        payloadHash: 'a'.repeat(64),
      });

      const message2 = new InboxMessageEntity({
        messageId: 'msg-001',
        consumerName: 'consumer-b',
        payloadHash: 'b'.repeat(64),
      });

      await em.persist(message1).flush();
      await em.persist(message2).flush();

      const saved1 = await em.findOne(InboxMessageEntity, {
        messageId: 'msg-001',
        consumerName: 'consumer-a',
      });

      const saved2 = await em.findOne(InboxMessageEntity, {
        messageId: 'msg-001',
        consumerName: 'consumer-b',
      });

      expect(saved1).toBeDefined();
      expect(saved2).toBeDefined();
      expect(saved1?.payloadHash).toBe('a'.repeat(64));
      expect(saved2?.payloadHash).toBe('b'.repeat(64));
    });

    it('deve rejeitar (consumerName, messageId) duplicado', async () => {
      const em = orm.em.fork();

      const message1 = new InboxMessageEntity({
        messageId: 'msg-001',
        consumerName: 'consumer-a',
        payloadHash: 'a'.repeat(64),
      });

      await em.persist(message1).flush();

      const message2 = new InboxMessageEntity({
        messageId: 'msg-001',
        consumerName: 'consumer-a',
        payloadHash: 'b'.repeat(64),
      });

      await expect(em.persist(message2).flush()).rejects.toThrow();
    });
  });

  describe('invariantes do banco', () => {
    it('deve rejeitar payloadHash com formato inválido (CHECK)', async () => {
      const em = orm.em.fork();

      const message = new InboxMessageEntity({
        messageId: 'msg-001',
        consumerName: 'consumer-a',
        payloadHash: 'invalid-hash',
      });

      await expect(em.persist(message).flush()).rejects.toThrow();
    });

    it('deve aceitar payloadHash SHA-256 válido', async () => {
      const em = orm.em.fork();

      const message = new InboxMessageEntity({
        messageId: 'msg-001',
        consumerName: 'consumer-a',
        payloadHash: 'a'.repeat(64),
      });

      await expect(em.persist(message).flush()).resolves.not.toThrow();
    });
  });

  describe('markProcessed()', () => {
    it('deve marcar mensagem como processada', async () => {
      const em = orm.em.fork();

      const message = new InboxMessageEntity({
        messageId: 'msg-001',
        consumerName: 'consumer-a',
        payloadHash: 'a'.repeat(64),
      });

      await em.persist(message).flush();

      const now = new Date();
      message.markProcessed(now);
      await em.flush();

      const saved = await em.findOne(InboxMessageEntity, {
        messageId: 'msg-001',
        consumerName: 'consumer-a',
      });

      expect(saved?.processedAt).toBeDefined();
      expect(saved?.processedAt?.toISOString()).toBe(now.toISOString());
    });
  });

  describe('índice em processedAt', () => {
    it('deve ter índice para consultas de mensagens não processadas', async () => {
      const em = orm.em.fork();

      for (let i = 0; i < 5; i++) {
        const message = new InboxMessageEntity({
          messageId: `msg-${i}`,
          consumerName: 'consumer-a',
          payloadHash: 'a'.repeat(64),
          processedAt: i % 2 === 0 ? new Date() : undefined,
        });
        await em.persist(message).flush();
      }

      const unprocessed = await em.find(InboxMessageEntity, {
        processedAt: null,
      });

      expect(unprocessed).toHaveLength(2);
    });
  });
});
