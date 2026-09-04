import { describe, it, expect } from 'bun:test';
import { Money, InvalidMoneyError, CurrencyMismatchError } from '../../wallet/domain/value-objects/money';

describe('Money', () => {
  describe('from() - creation', () => {
    it('creates money from valid string', () => {
      const money = Money.from({ amount: '25.00', currency: 'BRL' });
      expect(money.toAmountString()).toBe('25.00');
      expect(money.currency).toBe('BRL');
    });

    it('normalizes to 2 decimal places', () => {
      const money = Money.from({ amount: '25', currency: 'BRL' });
      expect(money.toAmountString()).toBe('25.00');
    });

    it('normalizes 1 decimal to 2', () => {
      const money = Money.from({ amount: '25.5', currency: 'BRL' });
      expect(money.toAmountString()).toBe('25.50');
    });

    it('creates zero money', () => {
      const money = Money.zero('BRL');
      expect(money.toAmountString()).toBe('0.00');
      expect(money.isZero()).toBe(true);
    });

    it('rejects empty amount', () => {
      expect(() => Money.from({ amount: '', currency: 'BRL' })).toThrow(InvalidMoneyError);
    });

    it('rejects NaN', () => {
      expect(() => Money.from({ amount: 'NaN', currency: 'BRL' })).toThrow(InvalidMoneyError);
    });

    it('rejects Infinity', () => {
      expect(() => Money.from({ amount: 'Infinity', currency: 'BRL' })).toThrow(InvalidMoneyError);
    });

    it('rejects scientific notation', () => {
      expect(() => Money.from({ amount: '1e10', currency: 'BRL' })).toThrow(InvalidMoneyError);
    });

    it('rejects more than 2 decimal places', () => {
      expect(() => Money.from({ amount: '25.999', currency: 'BRL' })).toThrow(InvalidMoneyError);
    });

    it('rejects negative input', () => {
      expect(() => Money.from({ amount: '-25.00', currency: 'BRL' })).toThrow(InvalidMoneyError);
    });

    it('rejects invalid currency format', () => {
      expect(() => Money.from({ amount: '25.00', currency: 'br' })).toThrow(InvalidMoneyError);
      expect(() => Money.from({ amount: '25.00', currency: 'BRLX' })).toThrow(InvalidMoneyError);
      expect(() => Money.from({ amount: '25.00', currency: '' })).toThrow(InvalidMoneyError);
    });

    it('rejects null/undefined amount', () => {
      expect(() => Money.from({ amount: null as any, currency: 'BRL' })).toThrow(InvalidMoneyError);
      expect(() => Money.from({ amount: undefined as any, currency: 'BRL' })).toThrow(InvalidMoneyError);
    });
  });

  describe('arithmetic operations', () => {
    it('adds two money values', () => {
      const a = Money.from({ amount: '25.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.50', currency: 'BRL' });
      const result = a.add(b);
      expect(result.toAmountString()).toBe('35.50');
    });

    it('subtracts two money values', () => {
      const a = Money.from({ amount: '50.00', currency: 'BRL' });
      const b = Money.from({ amount: '20.50', currency: 'BRL' });
      const result = a.subtract(b);
      expect(result.toAmountString()).toBe('29.50');
    });

    it('negates a money value', () => {
      const a = Money.from({ amount: '25.00', currency: 'BRL' });
      const result = a.negate();
      expect(result.toAmountString()).toBe('-25.00');
    });

    it('rejects addition of different currencies', () => {
      const a = Money.from({ amount: '25.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'USD' });
      expect(() => a.add(b)).toThrow(CurrencyMismatchError);
    });

    it('rejects subtraction of different currencies', () => {
      const a = Money.from({ amount: '25.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'USD' });
      expect(() => a.subtract(b)).toThrow(CurrencyMismatchError);
    });
  });

  describe('comparison operations', () => {
    it('checks equality', () => {
      const a = Money.from({ amount: '25.00', currency: 'BRL' });
      const b = Money.from({ amount: '25.00', currency: 'BRL' });
      expect(a.equals(b)).toBe(true);
    });

    it('checks inequality', () => {
      const a = Money.from({ amount: '25.00', currency: 'BRL' });
      const b = Money.from({ amount: '30.00', currency: 'BRL' });
      expect(a.equals(b)).toBe(false);
    });

    it('checks less than', () => {
      const a = Money.from({ amount: '25.00', currency: 'BRL' });
      const b = Money.from({ amount: '30.00', currency: 'BRL' });
      expect(a.isLessThan(b)).toBe(true);
      expect(b.isLessThan(a)).toBe(false);
    });

    it('checks zero', () => {
      const a = Money.zero('BRL');
      expect(a.isZero()).toBe(true);
      const b = Money.from({ amount: '0.01', currency: 'BRL' });
      expect(b.isZero()).toBe(false);
    });

    it('checks positive', () => {
      const a = Money.from({ amount: '25.00', currency: 'BRL' });
      expect(a.isPositive()).toBe(true);
      const b = Money.zero('BRL');
      expect(b.isPositive()).toBe(false);
    });

    it('serializes to JSON', () => {
      const a = Money.from({ amount: '25.00', currency: 'BRL' });
      expect(a.toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
    });
  });
});
