import { Money } from '../value-objects/money';
import { randomUUID } from 'crypto';

export enum LedgerDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export class InvalidLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLedgerError';
  }
}

export class WalletLedgerEntry {
  private constructor(
    public readonly id: string,
    public readonly walletId: string,
    public readonly transactionId: string,
    public readonly direction: LedgerDirection,
    public readonly money: Money,
    public readonly balanceBefore: Money,
    public readonly balanceAfter: Money,
    public readonly createdAt: Date,
  ) {}

  static create(props: {
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: Money;
    balanceBefore: Money;
    balanceAfter: Money;
  }): WalletLedgerEntry {
    const expectedBalance = props.direction === LedgerDirection.DEBIT
      ? props.balanceBefore.subtract(props.money)
      : props.balanceBefore.add(props.money);

    if (!expectedBalance.equals(props.balanceAfter)) {
      throw new InvalidLedgerError(
        `Ledger arithmetic mismatch: expected ${expectedBalance.toString()}, got ${props.balanceAfter.toString()}`,
      );
    }

    return new WalletLedgerEntry(
      randomUUID(),
      props.walletId,
      props.transactionId,
      props.direction,
      props.money,
      props.balanceBefore,
      props.balanceAfter,
      new Date(),
    );
  }

  static rehydrate(state: {
    id: string;
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: { amount: string; currency: string };
    balanceBefore: { amount: string; currency: string };
    balanceAfter: { amount: string; currency: string };
    createdAt: Date;
  }): WalletLedgerEntry {
    return new WalletLedgerEntry(
      state.id,
      state.walletId,
      state.transactionId,
      state.direction,
      Money.from(state.money),
      Money.fromPersisted(state.balanceBefore),
      Money.fromPersisted(state.balanceAfter),
      state.createdAt,
    );
  }

  isBalanced(): boolean {
    const expected = this.direction === LedgerDirection.DEBIT
      ? this.balanceBefore.subtract(this.money)
      : this.balanceBefore.add(this.money);
    return expected.equals(this.balanceAfter);
  }

  toJSON(): {
    id: string;
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: { amount: string; currency: string };
    balanceBefore: { amount: string; currency: string };
    balanceAfter: { amount: string; currency: string };
    createdAt: string;
  } {
    return {
      id: this.id,
      walletId: this.walletId,
      transactionId: this.transactionId,
      direction: this.direction,
      money: this.money.toJSON(),
      balanceBefore: this.balanceBefore.toJSON(),
      balanceAfter: this.balanceAfter.toJSON(),
      createdAt: this.createdAt.toISOString(),
    };
  }

  toString(): string {
    return `[${this.direction}] ${this.money.toString()} | ${this.balanceBefore.toString()} → ${this.balanceAfter.toString()}`;
  }
}
