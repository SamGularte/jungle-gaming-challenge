import { describe, it, expect } from 'bun:test';
import {
  InboxMessage,
  InvalidInboxMessageError,
  InboxMessageAlreadyProcessedError,
} from '../value-objects/inbox-message';

describe('InboxMessage - Value Object', () => {
  describe('receive()', () => {
    it('deve criar mensagem com sucesso', () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00', currency: 'BRL' });
      const inbox = InboxMessage.receive({
        messageId: 'msg-123',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });

      expect(inbox.messageId).toBe('msg-123');
      expect(inbox.consumerName).toBe('wager-consumer');
      expect(inbox.payloadHash).toBe(hash);
      expect(inbox.isProcessed()).toBe(false);
      expect(inbox.receivedAt).toBeInstanceOf(Date);
    });

    it('deve rejeitar messageId vazio', () => {
      expect(() => {
        InboxMessage.receive({
          messageId: '',
          consumerName: 'wager-consumer',
          payloadHash: 'abc123',
        });
      }).toThrow(InvalidInboxMessageError);
    });

    it('deve rejeitar consumerName vazio', () => {
      expect(() => {
        InboxMessage.receive({
          messageId: 'msg-123',
          consumerName: '',
          payloadHash: 'abc123',
        });
      }).toThrow(InvalidInboxMessageError);
    });

    it('deve rejeitar payloadHash vazio', () => {
      expect(() => {
        InboxMessage.receive({
          messageId: 'msg-123',
          consumerName: 'wager-consumer',
          payloadHash: '',
        });
      }).toThrow(InvalidInboxMessageError);
    });

    it('deve rejeitar payloadHash com formato inválido', () => {
      expect(() => {
        InboxMessage.receive({
          messageId: 'msg-123',
          consumerName: 'wager-consumer',
          payloadHash: 'invalid-hash',
        });
      }).toThrow(InvalidInboxMessageError);
    });

    it('deve aceitar payloadHash SHA-256 válido', () => {
      const hash = 'a'.repeat(64);
      const inbox = InboxMessage.receive({
        messageId: 'msg-123',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });

      expect(inbox.payloadHash).toBe(hash);
    });
  });

  describe('rehydrate()', () => {
    it('deve reconstruir mensagem do estado persistido', () => {
      const now = new Date();
      const processedAt = new Date(now.getTime() + 1000);

      const inbox = InboxMessage.rehydrate({
        messageId: 'msg-123',
        consumerName: 'wager-consumer',
        payloadHash: 'abc123',
        receivedAt: now,
        processedAt: processedAt,
      });

      expect(inbox.messageId).toBe('msg-123');
      expect(inbox.receivedAt).toBe(now);
      expect(inbox.processedAt).toBe(processedAt);
      expect(inbox.isProcessed()).toBe(true);
    });

    it('deve reconstruir mensagem não processada', () => {
      const now = new Date();

      const inbox = InboxMessage.rehydrate({
        messageId: 'msg-123',
        consumerName: 'wager-consumer',
        payloadHash: 'abc123',
        receivedAt: now,
      });

      expect(inbox.isProcessed()).toBe(false);
      expect(inbox.processedAt).toBeUndefined();
    });
  });

  describe('consultas', () => {
    it('isProcessed() deve retornar false para mensagem não processada', () => {
      const inbox = InboxMessage.receive({
        messageId: 'msg-123',
        consumerName: 'wager-consumer',
        payloadHash: 'a'.repeat(64),
      });

      expect(inbox.isProcessed()).toBe(false);
    });

    it('isProcessed() deve retornar true para mensagem processada', () => {
      const inbox = InboxMessage.receive({
        messageId: 'msg-123',
        consumerName: 'wager-consumer',
        payloadHash: 'a'.repeat(64),
      });

      inbox.markProcessed(new Date());
      expect(inbox.isProcessed()).toBe(true);
    });

    it('matchesPayload() deve comparar hashes', () => {
      const hash = InboxMessage.hashPayload({ amount: '25.00' });
      const inbox = InboxMessage.receive({
        messageId: 'msg-123',
        consumerName: 'wager-consumer',
        payloadHash: hash,
      });

      expect(inbox.matchesPayload(hash)).toBe(true);
      expect(inbox.matchesPayload('different-hash')).toBe(false);
    });

    it('getIdempotencyKey() deve retornar consumerName:messageId', () => {
      const inbox = InboxMessage.receive({
        messageId: 'msg-123',
        consumerName: 'wager-consumer',
        payloadHash: 'a'.repeat(64),
      });

      expect(inbox.getIdempotencyKey()).toBe('wager-consumer:msg-123');
    });
  });

  describe('markProcessed()', () => {
    it('deve marcar mensagem como processada', () => {
      const inbox = InboxMessage.receive({
        messageId: 'msg-123',
        consumerName: 'wager-consumer',
        payloadHash: 'a'.repeat(64),
      });

      const now = new Date();
      inbox.markProcessed(now);

      expect(inbox.isProcessed()).toBe(true);
      expect(inbox.processedAt).toBe(now);
    });

    it('deve rejeitar marcar mensagem já processada', () => {
      const inbox = InboxMessage.receive({
        messageId: 'msg-123',
        consumerName: 'wager-consumer',
        payloadHash: 'a'.repeat(64),
      });

      inbox.markProcessed(new Date());

      expect(() => {
        inbox.markProcessed(new Date());
      }).toThrow(InboxMessageAlreadyProcessedError);
    });
  });

  describe('serialização', () => {
    it('toJSON() deve serializar mensagem não processada', () => {
      const inbox = InboxMessage.receive({
        messageId: 'msg-123',
        consumerName: 'wager-consumer',
        payloadHash: 'a'.repeat(64),
      });

      const json = inbox.toJSON();
      expect(json.messageId).toBe('msg-123');
      expect(json.consumerName).toBe('wager-consumer');
      expect(json.payloadHash).toBe('a'.repeat(64));
      expect(json.processedAt).toBeUndefined();
    });

    it('toJSON() deve serializar mensagem processada', () => {
      const inbox = InboxMessage.receive({
        messageId: 'msg-123',
        consumerName: 'wager-consumer',
        payloadHash: 'a'.repeat(64),
      });

      const now = new Date();
      inbox.markProcessed(now);

      const json = inbox.toJSON();
      expect(json.processedAt).toBe(now.toISOString());
    });

    it('toString() deve serializar para string', () => {
      const inbox = InboxMessage.receive({
        messageId: 'msg-123',
        consumerName: 'wager-consumer',
        payloadHash: 'a'.repeat(64),
      });

      const str = inbox.toString();
      expect(str).toContain('msg-123');
      expect(str).toContain('wager-consumer');
      expect(str).toContain('processed=false');
    });
  });

  describe('hashPayload()', () => {
    it('deve gerar hash SHA-256 consistente', () => {
      const payload = { amount: '25.00', currency: 'BRL' };
      const hash1 = InboxMessage.hashPayload(payload);
      const hash2 = InboxMessage.hashPayload(payload);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('deve gerar hashes diferentes para payloads diferentes', () => {
      const hash1 = InboxMessage.hashPayload({ amount: '25.00' });
      const hash2 = InboxMessage.hashPayload({ amount: '50.00' });

      expect(hash1).not.toBe(hash2);
    });

    it('deve gerar hash para objetos complexos', () => {
      const payload = {
        amount: '25.00',
        currency: 'BRL',
        metadata: { source: 'api', version: 1 },
      };

      const hash = InboxMessage.hashPayload(payload);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
