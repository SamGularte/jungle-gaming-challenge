import { describe, it, expect } from 'bun:test';
import { randomUUID } from 'crypto';
import {
  IntegrationEvent,
  IntegrationEventProps,
  InvalidIntegrationEventError,
} from '../integration-event';

interface TestEventData {
  value: string;
  number: number;
}

class TestEvent extends IntegrationEvent<TestEventData> {
  readonly eventType = 'TestEvent';
  readonly version = 1;

  constructor(props: IntegrationEventProps<TestEventData>) {
    super(props);
  }

  static from(props: {
    aggregateId: string;
    correlationId: string;
    data: TestEventData;
    causationId?: string;
  }): TestEvent {
    return new TestEvent({
      eventId: randomUUID(),
      aggregateId: props.aggregateId,
      correlationId: props.correlationId,
      causationId: props.causationId,
      occurredAt: new Date(),
      data: props.data,
    });
  }
}

describe('IntegrationEvent - Abstract Base', () => {
  describe('criação', () => {
    it('deve criar evento com sucesso', () => {
      const event = TestEvent.from({
        aggregateId: 'agg-123',
        correlationId: 'corr-456',
        data: { value: 'test', number: 42 },
      });

      expect(event.eventId).toBeDefined();
      expect(event.eventType).toBe('TestEvent');
      expect(event.version).toBe(1);
      expect(event.aggregateId).toBe('agg-123');
      expect(event.correlationId).toBe('corr-456');
      expect(event.data).toEqual({ value: 'test', number: 42 });
      expect(event.occurredAt).toBeInstanceOf(Date);
    });

    it('deve criar evento com causationId', () => {
      const event = TestEvent.from({
        aggregateId: 'agg-123',
        correlationId: 'corr-456',
        causationId: 'cause-789',
        data: { value: 'test', number: 42 },
      });

      expect(event.causationId).toBe('cause-789');
    });

    it('deve rejeitar eventId vazio', () => {
      expect(() => {
        new TestEvent({
          eventId: '',
          aggregateId: 'agg-123',
          correlationId: 'corr-456',
          occurredAt: new Date(),
          data: { value: 'test', number: 42 },
        });
      }).toThrow(InvalidIntegrationEventError);
    });

    it('deve rejeitar aggregateId vazio', () => {
      expect(() => {
        new TestEvent({
          eventId: 'event-123',
          aggregateId: '',
          correlationId: 'corr-456',
          occurredAt: new Date(),
          data: { value: 'test', number: 42 },
        });
      }).toThrow(InvalidIntegrationEventError);
    });

    it('deve rejeitar correlationId vazio', () => {
      expect(() => {
        new TestEvent({
          eventId: 'event-123',
          aggregateId: 'agg-123',
          correlationId: '',
          occurredAt: new Date(),
          data: { value: 'test', number: 42 },
        });
      }).toThrow(InvalidIntegrationEventError);
    });

    it('deve rejeitar data vazio', () => {
      expect(() => {
        new TestEvent({
          eventId: 'event-123',
          aggregateId: 'agg-123',
          correlationId: 'corr-456',
          occurredAt: new Date(),
          data: {} as any,
        });
      }).toThrow(InvalidIntegrationEventError);
    });

    it('deve rejeitar data null', () => {
      expect(() => {
        new TestEvent({
          eventId: 'event-123',
          aggregateId: 'agg-123',
          correlationId: 'corr-456',
          occurredAt: new Date(),
          data: null as any,
        });
      }).toThrow(InvalidIntegrationEventError);
    });
  });

  describe('serialização', () => {
    it('toJSON() deve serializar corretamente', () => {
      const event = TestEvent.from({
        aggregateId: 'agg-123',
        correlationId: 'corr-456',
        causationId: 'cause-789',
        data: { value: 'test', number: 42 },
      });

      const json = event.toJSON();

      expect(json.eventId).toBe(event.eventId);
      expect(json.eventType).toBe('TestEvent');
      expect(json.version).toBe(1);
      expect(json.aggregateId).toBe('agg-123');
      expect(json.correlationId).toBe('corr-456');
      expect(json.causationId).toBe('cause-789');
      expect(json.occurredAt).toBe(event.occurredAt.toISOString());
      expect(json.data).toEqual({ value: 'test', number: 42 });
    });

    it('toString() deve serializar para string', () => {
      const event = TestEvent.from({
        aggregateId: 'agg-123',
        correlationId: 'corr-456',
        data: { value: 'test', number: 42 },
      });

      const str = event.toString();
      expect(str).toContain(event.eventId);
      expect(str).toContain('TestEvent');
      expect(str).toContain('agg-123');
      expect(str).toContain('corr-456');
    });
  });

  describe('imutabilidade', () => {
    it('data deve ser imutável (Object.freeze)', () => {
      const event = TestEvent.from({
        aggregateId: 'agg-123',
        correlationId: 'corr-456',
        data: { value: 'test', number: 42 },
      });

      expect(Object.isFrozen(event.data)).toBe(true);

      expect(() => {
        (event.data as any).value = 'modified';
      }).toThrow();
    });
  });
});
