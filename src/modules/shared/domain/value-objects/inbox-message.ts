import { createHash } from 'crypto';

export class InvalidInboxMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInboxMessageError';
  }
}

export class InboxMessageAlreadyProcessedError extends Error {
  constructor(messageId: string) {
    super(`Inbox message ${messageId} already processed`);
    this.name = 'InboxMessageAlreadyProcessedError';
  }
}

export interface InboxMessageState {
  messageId: string;
  consumerName: string;
  payloadHash: string;
  receivedAt: Date;
  processedAt?: Date;
}

export class InboxMessage {
  private _processedAt?: Date;

  private constructor(
    public readonly messageId: string,
    public readonly consumerName: string,
    public readonly payloadHash: string,
    public readonly receivedAt: Date,
    processedAt?: Date,
  ) {
    this._processedAt = processedAt;
  }

  static receive(props: {
    messageId: string;
    consumerName: string;
    payloadHash: string;
  }): InboxMessage {
    if (!props.messageId || props.messageId.trim().length === 0) {
      throw new InvalidInboxMessageError('messageId is required');
    }

    if (!props.consumerName || props.consumerName.trim().length === 0) {
      throw new InvalidInboxMessageError('consumerName is required');
    }

    if (!props.payloadHash || props.payloadHash.trim().length === 0) {
      throw new InvalidInboxMessageError('payloadHash is required');
    }

    if (!/^[a-f0-9]{64}$/i.test(props.payloadHash)) {
      throw new InvalidInboxMessageError(
        `Invalid payloadHash format: ${props.payloadHash}. Expected SHA-256 (64 hex characters)`,
      );
    }

    return new InboxMessage(
      props.messageId,
      props.consumerName,
      props.payloadHash,
      new Date(),
    );
  }

  static rehydrate(state: InboxMessageState): InboxMessage {
    return new InboxMessage(
      state.messageId,
      state.consumerName,
      state.payloadHash,
      state.receivedAt,
      state.processedAt,
    );
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  isProcessed(): boolean {
    return !!this._processedAt;
  }

  matchesPayload(hash: string): boolean {
    return this.payloadHash === hash;
  }

  getIdempotencyKey(): string {
    return `${this.consumerName}:${this.messageId}`;
  }

  markProcessed(at: Date): void {
    if (this.isProcessed()) {
      throw new InboxMessageAlreadyProcessedError(this.messageId);
    }

    this._processedAt = at;
  }

  toJSON(): {
    messageId: string;
    consumerName: string;
    payloadHash: string;
    receivedAt: string;
    processedAt?: string;
  } {
    return {
      messageId: this.messageId,
      consumerName: this.consumerName,
      payloadHash: this.payloadHash,
      receivedAt: this.receivedAt.toISOString(),
      processedAt: this._processedAt?.toISOString(),
    };
  }

  toString(): string {
    return `InboxMessage(messageId=${this.messageId}, consumer=${this.consumerName}, processed=${this.isProcessed()})`;
  }

  static hashPayload(payload: unknown): string {
    const json = JSON.stringify(payload);
    return createHash('sha256').update(json).digest('hex');
  }
}
