import { Money } from '../value-objects/money';
import { WalletLedgerEntry, LedgerDirection } from './wallet-ledger-entry';

export class InsufficientBalanceError extends Error {
  constructor(
    public readonly balance: Money,
    public readonly requested: Money,
  ) {
    super(`Insufficient balance: ${balance.toString()} < ${requested.toString()}`);
    this.name = 'InsufficientBalanceError';
  }
}

export class InvalidWalletOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWalletOperationError';
  }
}

export class CurrencyMismatchError extends Error {
  constructor(
    public readonly walletCurrency: string,
    public readonly operationCurrency: string,
  ) {
    super(`Currency mismatch: wallet=${walletCurrency}, operation=${operationCurrency}`);
    this.name = 'CurrencyMismatchError';
  }
}

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: { amount: string; currency: string };
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Wallet {
  private _balance: Money;
  private _version: number;
  private _updatedAt: Date;

  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    initialBalance: Money,
    version: number,
    public readonly createdAt: Date,
    updatedAt: Date,
  ) {
    this._balance = initialBalance;
    this._version = version;
    this._updatedAt = updatedAt;
  }

  static open(props: {
    id: string;
    playerId: string;
    initialBalance: Money;
  }): Wallet {
    if (props.initialBalance.isNegative()) {
      throw new InvalidWalletOperationError(
        `Initial balance cannot be negative: ${props.initialBalance.toString()}`,
      );
    }

    const now = new Date();
    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      now,
      now,
    );
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      Money.fromPersisted(state.balance),
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(amount: Money, transactionId: string): WalletLedgerEntry {
    this.assertSameCurrency(amount);
    this.assertSufficientBalance(amount);

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.subtract(amount);

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = new Date();

    return WalletLedgerEntry.create({
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.DEBIT,
      money: amount,
      balanceBefore,
      balanceAfter,
    });
  }

  credit(amount: Money, transactionId: string): WalletLedgerEntry {
    this.assertSameCurrency(amount);

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.add(amount);

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = new Date();

    return WalletLedgerEntry.create({
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.CREDIT,
      money: amount,
      balanceBefore,
      balanceAfter,
    });
  }

  private assertSameCurrency(amount: Money): void {
    if (this.currency !== amount.currency) {
      throw new CurrencyMismatchError(this.currency, amount.currency);
    }
  }

  private assertSufficientBalance(amount: Money): void {
    if (this._balance.isLessThan(amount)) {
      throw new InsufficientBalanceError(this._balance, amount);
    }
  }

  hasSufficientBalance(amount: Money): boolean {
    if (this.currency !== amount.currency) {
      return false;
    }
    return !this._balance.isLessThan(amount);
  }

  isEmpty(): boolean {
    return this._balance.isZero();
  }

  toJSON(): {
    id: string;
    playerId: string;
    currency: string;
    balance: { amount: string; currency: string };
    version: number;
    createdAt: string;
    updatedAt: string;
  } {
    return {
      id: this.id,
      playerId: this.playerId,
      currency: this.currency,
      balance: this._balance.toJSON(),
      version: this._version,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }

  toString(): string {
    return `Wallet(id=${this.id}, player=${this.playerId}, currency=${this.currency}, balance=${this._balance.toString()}, version=${this._version})`;
  }
}
