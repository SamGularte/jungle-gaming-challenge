import { randomUUID } from 'crypto';

export class InvalidOutboxMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOutboxMessageError';
  }
}

export class OutboxMessageAlreadyPublishedError extends Error {
  constructor(id: string) {
    super(`Outbox message ${id} already published`);
    this.name = 'OutboxMessageAlreadyPublishedError';
  }
}

export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;
}

export class OutboxMessage {
  private _attempts: number;
  private _nextAttemptAt?: Date;
  private _publishedAt?: Date;

  private constructor(
    public readonly id: string,
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Readonly<Record<string, unknown>>,
    public readonly occurredAt: Date,
    attempts: number,
    nextAttemptAt?: Date,
    publishedAt?: Date,
  ) {
    this._attempts = attempts;
    this._nextAttemptAt = nextAttemptAt;
    this._publishedAt = publishedAt;
  }

  static enqueue(props: {
    aggregateId: string;
    eventType: string;
    payload: Readonly<Record<string, unknown>>;
  }): OutboxMessage {
    if (!props.aggregateId || props.aggregateId.trim().length === 0) {
      throw new InvalidOutboxMessageError('aggregateId is required');
    }

    if (!props.eventType || props.eventType.trim().length === 0) {
      throw new InvalidOutboxMessageError('eventType is required');
    }

    if (!props.payload || typeof props.payload !== 'object') {
      throw new InvalidOutboxMessageError('payload must be a non-null object');
    }

    if (Object.keys(props.payload).length === 0) {
      throw new InvalidOutboxMessageError('payload cannot be empty');
    }

    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(props.eventType)) {
      throw new InvalidOutboxMessageError(
        `Invalid eventType format: ${props.eventType}. Expected alphanumeric starting with letter`,
      );
    }

    const now = new Date();
    return new OutboxMessage(
      randomUUID(),
      props.aggregateId,
      props.eventType,
      props.payload,
      now,
      0,
      now,
    );
  }

  static rehydrate(state: OutboxMessageState): OutboxMessage {
    return new OutboxMessage(
      state.id,
      state.aggregateId,
      state.eventType,
      state.payload,
      state.occurredAt,
      state.attempts,
      state.nextAttemptAt,
      state.publishedAt,
    );
  }

  get attempts(): number {
    return this._attempts;
  }

  get nextAttemptAt(): Date | undefined {
    return this._nextAttemptAt;
  }

  get publishedAt(): Date | undefined {
    return this._publishedAt;
  }

  isPending(): boolean {
    return !this._publishedAt;
  }

  isDue(now: Date): boolean {
    if (!this.isPending()) {
      return false;
    }

    if (!this._nextAttemptAt) {
      return true;
    }

    return this._nextAttemptAt <= now;
  }

  hasExceededMaxAttempts(maxAttempts: number = 10): boolean {
    return this._attempts >= maxAttempts;
  }

  markPublished(at: Date): void {
    if (this._publishedAt) {
      throw new OutboxMessageAlreadyPublishedError(this.id);
    }

    this._publishedAt = at;
  }

  scheduleRetry(now: Date): void {
    if (this._publishedAt) {
      throw new OutboxMessageAlreadyPublishedError(this.id);
    }

    this._attempts += 1;

    const delay = Math.pow(2, this._attempts) * 1000;
    this._nextAttemptAt = new Date(now.getTime() + delay);
  }

  toJSON(): {
    id: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    occurredAt: string;
    attempts: number;
    nextAttemptAt?: string;
    publishedAt?: string;
  } {
    return {
      id: this.id,
      aggregateId: this.aggregateId,
      eventType: this.eventType,
      payload: { ...this.payload },
      occurredAt: this.occurredAt.toISOString(),
      attempts: this._attempts,
      nextAttemptAt: this._nextAttemptAt?.toISOString(),
      publishedAt: this._publishedAt?.toISOString(),
    };
  }

  toString(): string {
    return `OutboxMessage(id=${this.id}, event=${this.eventType}, aggregate=${this.aggregateId}, attempts=${this._attempts}, published=${!!this._publishedAt})`;
  }

  static calculateNextRetry(attempts: number, now: Date): Date {
    const delay = Math.pow(2, attempts) * 1000;
    return new Date(now.getTime() + delay);
  }
}
