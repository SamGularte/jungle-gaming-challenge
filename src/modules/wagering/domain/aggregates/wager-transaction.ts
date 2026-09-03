import { Money } from '../../../wallet/domain/value-objects/money';
import { randomUUID } from 'crypto';

export enum WagerTransactionKind {
  OPENING = 'OPENING',
  BET = 'BET',
  WIN = 'WIN',
  LOSS = 'LOSS',
  REFUND = 'REFUND',
  ROLLBACK = 'ROLLBACK',
}

export enum WagerTransactionStatus {
  PENDING = 'PENDING',
  PENDING_REFERENCE = 'PENDING_REFERENCE',
  PROCESSED = 'PROCESSED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

export enum FailureCode {
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_BALANCE_FOR_REVERSAL = 'INSUFFICIENT_BALANCE_FOR_REVERSAL',
  REFERENCE_NOT_FOUND = 'REFERENCE_NOT_FOUND',
  REFERENCE_ALREADY_REVERSED = 'REFERENCE_ALREADY_REVERSED',
  INVALID_REFERENCE_KIND = 'INVALID_REFERENCE_KIND',
  REFERENCE_VALUE_MISMATCH = 'REFERENCE_VALUE_MISMATCH',
  DUPLICATE_IDEMPOTENCY_KEY = 'DUPLICATE_IDEMPOTENCY_KEY',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  CURRENCY_MISMATCH = 'CURRENCY_MISMATCH',
  PLAYER_MISMATCH = 'PLAYER_MISMATCH',
  ROUND_MISMATCH = 'ROUND_MISMATCH',
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
  INVALID_REFERENCE_EXTERNAL_ID = 'INVALID_REFERENCE_EXTERNAL_ID',
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
}

export class InvalidTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransactionError';
  }
}

export class InvalidTransactionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransactionStateError';
  }
}

export interface WagerTransactionState {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: { amount: string; currency: string };
  referenceExternalTransactionId?: string;
  createdAt: Date;
  status: WagerTransactionStatus;
  referenceTransactionId?: string;
  failureCode?: FailureCode;
  processedAt?: Date;
}

export class WagerTransaction {
  private _status: WagerTransactionStatus;
  private _referenceTransactionId?: string;
  private _failureCode?: FailureCode;
  private _processedAt?: Date;

  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    status: WagerTransactionStatus,
    referenceTransactionId?: string,
    failureCode?: FailureCode,
    processedAt?: Date,
  ) {
    this._status = status;
    this._referenceTransactionId = referenceTransactionId;
    this._failureCode = failureCode;
    this._processedAt = processedAt;
  }

  static create(props: {
    id: string;
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: Money;
    referenceExternalTransactionId?: string;
  }): WagerTransaction {
    if (props.kind === WagerTransactionKind.OPENING) {
      throw new InvalidTransactionError(
        'OPENING transactions are internal only and cannot be created via API or queue',
      );
    }

    const requiresReference = [
      WagerTransactionKind.REFUND,
      WagerTransactionKind.ROLLBACK,
    ].includes(props.kind);

    if (requiresReference && !props.referenceExternalTransactionId) {
      throw new InvalidTransactionError(
        `${props.kind} requires a reference external transaction ID`,
      );
    }

    if (!props.providerId || props.providerId.trim().length === 0) {
      throw new InvalidTransactionError('providerId is required');
    }

    if (!props.externalTransactionId || props.externalTransactionId.trim().length === 0) {
      throw new InvalidTransactionError('externalTransactionId is required');
    }

    if (!props.idempotencyKey || props.idempotencyKey.trim().length === 0) {
      throw new InvalidTransactionError('idempotencyKey is required');
    }

    if (!props.payloadHash || props.payloadHash.trim().length === 0) {
      throw new InvalidTransactionError('payloadHash is required');
    }

    if (!props.walletId || props.walletId.trim().length === 0) {
      throw new InvalidTransactionError('walletId is required');
    }

    if (!props.playerId || props.playerId.trim().length === 0) {
      throw new InvalidTransactionError('playerId is required');
    }

    if (!props.roundId || props.roundId.trim().length === 0) {
      throw new InvalidTransactionError('roundId is required');
    }

    if (!props.gameId || props.gameId.trim().length === 0) {
      throw new InvalidTransactionError('gameId is required');
    }

    if (props.kind === WagerTransactionKind.LOSS && props.money.isZero()) {
      throw new InvalidTransactionError(
        'LOSS transaction must have a money amount (even if it does not affect balance)',
      );
    }

    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      new Date(),
      WagerTransactionStatus.PENDING,
    );
  }

  static rehydrate(state: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(
      state.id,
      state.providerId,
      state.externalTransactionId,
      state.idempotencyKey,
      state.payloadHash,
      state.walletId,
      state.playerId,
      state.roundId,
      state.gameId,
      state.kind,
      Money.fromPersisted(state.money),
      state.referenceExternalTransactionId,
      state.createdAt,
      state.status,
      state.referenceTransactionId,
      state.failureCode,
      state.processedAt,
    );
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }

  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }

  get failureCode(): FailureCode | undefined {
    return this._failureCode;
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  markProcessed(referenceTransactionId: string | undefined, at: Date): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(
        `Transaction ${this.id} is already terminal (status: ${this._status})`,
      );
    }

    if (this.requiresReference() && !referenceTransactionId) {
      throw new InvalidTransactionStateError(
        `${this.kind} requires a reference transaction ID when marking as PROCESSED`,
      );
    }

    this._status = WagerTransactionStatus.PROCESSED;
    this._referenceTransactionId = referenceTransactionId;
    this._processedAt = at;
  }

  markPendingReference(): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(
        `Transaction ${this.id} is already terminal (status: ${this._status})`,
      );
    }

    if (!this.requiresReference()) {
      throw new InvalidTransactionStateError(
        `Only transactions that require a reference can be marked as PENDING_REFERENCE (kind: ${this.kind})`,
      );
    }

    this._status = WagerTransactionStatus.PENDING_REFERENCE;
  }

  reject(code: FailureCode): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(
        `Transaction ${this.id} is already terminal (status: ${this._status})`,
      );
    }

    this._status = WagerTransactionStatus.REJECTED;
    this._failureCode = code;
    this._processedAt = new Date();
  }

  fail(code: FailureCode): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(
        `Transaction ${this.id} is already terminal (status: ${this._status})`,
      );
    }

    this._status = WagerTransactionStatus.FAILED;
    this._failureCode = code;
    this._processedAt = new Date();
  }

  isTerminal(): boolean {
    return [
      WagerTransactionStatus.PROCESSED,
      WagerTransactionStatus.REJECTED,
      WagerTransactionStatus.FAILED,
    ].includes(this._status);
  }

  affectsBalance(): boolean {
    if (this.kind === WagerTransactionKind.LOSS) {
      return false;
    }

    if (this._status === WagerTransactionStatus.REJECTED) {
      return false;
    }

    if (this._status === WagerTransactionStatus.FAILED) {
      return false;
    }

    return true;
  }

  requiresReference(): boolean {
    return [
      WagerTransactionKind.REFUND,
      WagerTransactionKind.ROLLBACK,
    ].includes(this.kind);
  }

  matchesPayload(hash: string): boolean {
    return this.payloadHash === hash;
  }

  ledgerDirectionFor(reference?: WagerTransaction): 'DEBIT' | 'CREDIT' | null {
    if (!this.affectsBalance()) {
      return null;
    }

    if (this._status === WagerTransactionStatus.REJECTED ||
        this._status === WagerTransactionStatus.FAILED) {
      return null;
    }

    switch (this.kind) {
      case WagerTransactionKind.OPENING:
      case WagerTransactionKind.WIN:
      case WagerTransactionKind.REFUND:
        return 'CREDIT';

      case WagerTransactionKind.BET:
        return 'DEBIT';

      case WagerTransactionKind.ROLLBACK:
        if (!reference) {
          throw new InvalidTransactionError(
            'ROLLBACK requires a reference transaction to determine ledger direction',
          );
        }
        const refDirection = reference.ledgerDirectionFor();
        return refDirection === 'DEBIT' ? 'CREDIT' : 'DEBIT';

      default:
        return null;
    }
  }

  isValidReference(reference: WagerTransaction): boolean {
    if (!this.requiresReference()) {
      return false;
    }

    if (reference.status !== WagerTransactionStatus.PROCESSED) {
      return false;
    }

    if (this.walletId !== reference.walletId) {
      return false;
    }

    if (this.playerId !== reference.playerId) {
      return false;
    }

    if (!this.money.equals(reference.money)) {
      return false;
    }

    if (this.kind === WagerTransactionKind.REFUND) {
      return reference.kind === WagerTransactionKind.BET;
    }

    if (this.kind === WagerTransactionKind.ROLLBACK) {
      return [
        WagerTransactionKind.BET,
        WagerTransactionKind.WIN,
        WagerTransactionKind.REFUND,
      ].includes(reference.kind);
    }

    return false;
  }

  hasSameValueAs(reference: WagerTransaction): boolean {
    return this.money.equals(reference.money);
  }

  isReversal(): boolean {
    return [
      WagerTransactionKind.REFUND,
      WagerTransactionKind.ROLLBACK,
    ].includes(this.kind);
  }

  toJSON(): {
    id: string;
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: { amount: string; currency: string };
    referenceExternalTransactionId?: string;
    createdAt: string;
    status: WagerTransactionStatus;
    referenceTransactionId?: string;
    failureCode?: FailureCode;
    processedAt?: string;
  } {
    return {
      id: this.id,
      providerId: this.providerId,
      externalTransactionId: this.externalTransactionId,
      idempotencyKey: this.idempotencyKey,
      payloadHash: this.payloadHash,
      walletId: this.walletId,
      playerId: this.playerId,
      roundId: this.roundId,
      gameId: this.gameId,
      kind: this.kind,
      money: this.money.toJSON(),
      referenceExternalTransactionId: this.referenceExternalTransactionId,
      createdAt: this.createdAt.toISOString(),
      status: this._status,
      referenceTransactionId: this._referenceTransactionId,
      failureCode: this._failureCode,
      processedAt: this._processedAt?.toISOString(),
    };
  }

  toString(): string {
    return `WagerTransaction(id=${this.id}, kind=${this.kind}, status=${this._status}, provider=${this.providerId}, externalId=${this.externalTransactionId}, amount=${this.money.toString()})`;
  }
}
