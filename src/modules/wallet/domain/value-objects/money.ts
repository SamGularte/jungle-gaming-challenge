import Decimal from 'decimal.js';

export interface MoneyProps {
  amount: string;
  currency: string;
}

export class CurrencyMismatchError extends Error {
  constructor(
    public readonly currency1: string,
    public readonly currency2: string,
  ) {
    super(`Currency mismatch: ${currency1} vs ${currency2}`);
    this.name = 'CurrencyMismatchError';
  }
}

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoneyError';
  }
}

export class Money {
  private readonly value: Decimal;

  private constructor(value: Decimal, public readonly currency: string) {
    this.value = value;
  }

  static from(props: MoneyProps): Money {
    this.validateInput(props);
    const decimal = new Decimal(props.amount);
    const normalizedAmount = decimal.toFixed(2);
    return new Money(new Decimal(normalizedAmount), props.currency);
  }

  static fromPersisted(props: MoneyProps): Money {
    this.validatePersistedInput(props);
    const decimal = new Decimal(props.amount);
    const normalizedAmount = decimal.toFixed(2);
    return new Money(new Decimal(normalizedAmount), props.currency);
  }

  static zero(currency: string): Money {
    return new Money(new Decimal('0.00'), currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    const result = this.value.plus(other.value);
    return new Money(result, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    const result = this.value.minus(other.value);
    return new Money(result, this.currency);
  }

  negate(): Money {
    return new Money(this.value.negated(), this.currency);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  isNegative(): boolean {
    return this.value.lessThan(0);
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }

  isLessThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThanOrEqualTo(other.value);
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.greaterThan(other.value);
  }

  isGreaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.greaterThanOrEqualTo(other.value);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  toJSON(): MoneyProps {
    return {
      amount: this.value.toFixed(2),
      currency: this.currency,
    };
  }

  toString(): string {
    return `${this.value.toFixed(2)} ${this.currency}`;
  }

  toAmountString(): string {
    return this.value.toFixed(2);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  private static validateInput(props: MoneyProps): void {
    if (props.amount === undefined || props.amount === null) {
      throw new InvalidMoneyError('Amount is required');
    }

    if (!props.currency || props.currency.trim().length === 0) {
      throw new InvalidMoneyError('Currency is required');
    }

    if (props.currency.length !== 3) {
      throw new InvalidMoneyError(
        `Invalid currency format: ${props.currency}. Must be ISO-4217 (3 characters)`,
      );
    }

    if (!/^[A-Z]{3}$/.test(props.currency)) {
      throw new InvalidMoneyError(
        `Invalid currency format: ${props.currency}. Must be uppercase letters only`,
      );
    }

    const amountStr = props.amount.toString().trim();

    if (amountStr.length === 0) {
      throw new InvalidMoneyError('Amount cannot be empty');
    }

    const validFormat = /^\d+(\.\d{1,2})?$/.test(amountStr);
    if (!validFormat) {
      throw new InvalidMoneyError(
        `Invalid amount format: ${amountStr}. Expected format: "100.00" or "100"`,
      );
    }

    let decimal: Decimal;
    try {
      decimal = new Decimal(amountStr);
    } catch {
      throw new InvalidMoneyError(`Amount must be a valid number: ${amountStr}`);
    }

    if (!decimal.isFinite()) {
      throw new InvalidMoneyError('Amount must be a finite number');
    }

    if (decimal.isNaN()) {
      throw new InvalidMoneyError('Amount must be a valid number');
    }

    const decimalPlaces = amountStr.split('.')[1]?.length || 0;
    if (decimalPlaces > 2) {
      throw new InvalidMoneyError(
        `Amount cannot have more than 2 decimal places: ${amountStr}`,
      );
    }

    if (decimal.isNegative()) {
      throw new InvalidMoneyError('Amount cannot be negative in input');
    }
  }

  private static validatePersistedInput(props: MoneyProps): void {
    if (props.amount === undefined || props.amount === null) {
      throw new InvalidMoneyError('Amount is required');
    }

    if (!props.currency || props.currency.trim().length === 0) {
      throw new InvalidMoneyError('Currency is required');
    }

    if (props.currency.length !== 3) {
      throw new InvalidMoneyError(
        `Invalid currency format: ${props.currency}. Must be ISO-4217 (3 characters)`,
      );
    }

    if (!/^[A-Z]{3}$/.test(props.currency)) {
      throw new InvalidMoneyError(
        `Invalid currency format: ${props.currency}. Must be uppercase letters only`,
      );
    }

    const amountStr = props.amount.toString().trim();

    if (amountStr.length === 0) {
      throw new InvalidMoneyError('Amount cannot be empty');
    }

    const validFormat = /^-?\d+(\.\d{1,2})?$/.test(amountStr);
    if (!validFormat) {
      throw new InvalidMoneyError(
        `Invalid amount format: ${amountStr}. Expected format: "100.00", "-100.00" or "100"`,
      );
    }

    let decimal: Decimal;
    try {
      decimal = new Decimal(amountStr);
    } catch {
      throw new InvalidMoneyError(`Amount must be a valid number: ${amountStr}`);
    }

    if (!decimal.isFinite()) {
      throw new InvalidMoneyError('Amount must be a finite number');
    }

    if (decimal.isNaN()) {
      throw new InvalidMoneyError('Amount must be a valid number');
    }

    const decimalPlaces = amountStr.split('.')[1]?.length || 0;
    if (decimalPlaces > 2) {
      throw new InvalidMoneyError(
        `Amount cannot have more than 2 decimal places: ${amountStr}`,
      );
    }
  }
}
