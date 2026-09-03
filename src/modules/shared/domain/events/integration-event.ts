import { randomUUID } from 'crypto';

export class InvalidIntegrationEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidIntegrationEventError';
  }
}

export interface IntegrationEventProps<T> {
  eventId: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  occurredAt: Date;
  data: T;
}

export abstract class IntegrationEvent<T> {
  abstract readonly eventType: string;
  abstract readonly version: number;

  readonly eventId: string;
  readonly aggregateId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly occurredAt: Date;
  readonly data: Readonly<T>;

  protected constructor(props: IntegrationEventProps<T>) {
    if (!props.eventId || props.eventId.trim().length === 0) {
      throw new InvalidIntegrationEventError('eventId is required');
    }

    if (!props.aggregateId || props.aggregateId.trim().length === 0) {
      throw new InvalidIntegrationEventError('aggregateId is required');
    }

    if (!props.correlationId || props.correlationId.trim().length === 0) {
      throw new InvalidIntegrationEventError('correlationId is required');
    }

    if (!props.data || typeof props.data !== 'object') {
      throw new InvalidIntegrationEventError('data must be a non-null object');
    }

    if (Object.keys(props.data).length === 0) {
      throw new InvalidIntegrationEventError('data cannot be empty');
    }

    this.eventId = props.eventId;
    this.aggregateId = props.aggregateId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
    this.occurredAt = props.occurredAt || new Date();
    this.data = Object.freeze({ ...props.data });
  }

  toJSON(): {
    eventId: string;
    eventType: string;
    aggregateId: string;
    correlationId: string;
    causationId?: string;
    occurredAt: string;
    version: number;
    data: T;
  } {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      aggregateId: this.aggregateId,
      correlationId: this.correlationId,
      causationId: this.causationId,
      occurredAt: this.occurredAt.toISOString(),
      version: this.version,
      data: { ...this.data },
    };
  }

  toString(): string {
    return `IntegrationEvent(eventId=${this.eventId}, eventType=${this.eventType}, aggregate=${this.aggregateId}, correlation=${this.correlationId})`;
  }
}
