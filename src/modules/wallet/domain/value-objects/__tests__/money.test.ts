import { describe, it, expect } from 'bun:test';
import {
  Money,
  CurrencyMismatchError,
  InvalidMoneyError,
} from '../money';

describe('Money - Value Object', () => {
  describe('criação e validação de entrada', () => {
    it('deve criar Money com valor válido', () => {
      const money = Money.from({ amount: '100.00', currency: 'BRL' });
      expect(money.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
    });

    it('deve criar Money com valor inteiro', () => {
      const money = Money.from({ amount: '100', currency: 'BRL' });
      expect(money.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
    });

    it('deve criar Money com 1 casa decimal', () => {
      const money = Money.from({ amount: '100.5', currency: 'BRL' });
      expect(money.toJSON()).toEqual({ amount: '100.50', currency: 'BRL' });
    });

    it('deve criar Money com valor zero', () => {
      const money = Money.from({ amount: '0.00', currency: 'BRL' });
      expect(money.toJSON()).toEqual({ amount: '0.00', currency: 'BRL' });
      expect(money.isZero()).toBe(true);
    });

    it('deve rejeitar valor com mais de 2 casas decimais', () => {
      expect(() => {
        Money.from({ amount: '100.123', currency: 'BRL' });
      }).toThrow(InvalidMoneyError);
    });

    it('deve rejeitar valor negativo na entrada', () => {
      expect(() => {
        Money.from({ amount: '-100.00', currency: 'BRL' });
      }).toThrow(InvalidMoneyError);
    });

    it('deve rejeitar valor vazio', () => {
      expect(() => {
        Money.from({ amount: '', currency: 'BRL' });
      }).toThrow(InvalidMoneyError);
    });

    it('deve rejeitar moeda vazia', () => {
      expect(() => {
        Money.from({ amount: '100.00', currency: '' });
      }).toThrow(InvalidMoneyError);
    });

    it('deve rejeitar moeda com formato inválido (2 caracteres)', () => {
      expect(() => {
        Money.from({ amount: '100.00', currency: 'BR' });
      }).toThrow(InvalidMoneyError);
    });

    it('deve rejeitar moeda com formato inválido (4 caracteres)', () => {
      expect(() => {
        Money.from({ amount: '100.00', currency: 'BRLA' });
      }).toThrow(InvalidMoneyError);
    });

    it('deve rejeitar moeda com letras minúsculas', () => {
      expect(() => {
        Money.from({ amount: '100.00', currency: 'brl' });
      }).toThrow(InvalidMoneyError);
    });

    it('deve rejeitar moeda com caracteres especiais', () => {
      expect(() => {
        Money.from({ amount: '100.00', currency: 'B$L' });
      }).toThrow(InvalidMoneyError);
    });

    it('deve rejeitar notação científica', () => {
      expect(() => {
        Money.from({ amount: '1e3', currency: 'BRL' });
      }).toThrow(InvalidMoneyError);
    });

    it('deve rejeitar NaN', () => {
      expect(() => {
        Money.from({ amount: 'abc', currency: 'BRL' });
      }).toThrow(InvalidMoneyError);
    });

    it('deve rejeitar Infinity', () => {
      expect(() => {
        Money.from({ amount: 'Infinity', currency: 'BRL' });
      }).toThrow(InvalidMoneyError);
    });

    it('deve rejeitar formato com vírgula', () => {
      expect(() => {
        Money.from({ amount: '100,00', currency: 'BRL' });
      }).toThrow(InvalidMoneyError);
    });

    it('deve rejeitar formato com sinal de mais', () => {
      expect(() => {
        Money.from({ amount: '+100.00', currency: 'BRL' });
      }).toThrow(InvalidMoneyError);
    });
  });

  describe('Money.zero()', () => {
    it('deve criar Money com valor zero', () => {
      const money = Money.zero('BRL');
      expect(money.toJSON()).toEqual({ amount: '0.00', currency: 'BRL' });
      expect(money.isZero()).toBe(true);
    });

    it('deve criar Money com valor zero em diferentes moedas', () => {
      const brl = Money.zero('BRL');
      const usd = Money.zero('USD');

      expect(brl.toJSON()).toEqual({ amount: '0.00', currency: 'BRL' });
      expect(usd.toJSON()).toEqual({ amount: '0.00', currency: 'USD' });
    });
  });

  describe('operações aritméticas', () => {
    describe('add()', () => {
      it('deve somar dois valores na mesma moeda', () => {
        const a = Money.from({ amount: '100.00', currency: 'BRL' });
        const b = Money.from({ amount: '50.00', currency: 'BRL' });
        const result = a.add(b);
        expect(result.toJSON()).toEqual({ amount: '150.00', currency: 'BRL' });
      });

      it('deve somar valores com casas decimais', () => {
        const a = Money.from({ amount: '0.10', currency: 'BRL' });
        const b = Money.from({ amount: '0.20', currency: 'BRL' });
        const result = a.add(b);
        expect(result.toJSON()).toEqual({ amount: '0.30', currency: 'BRL' });
      });

      it('deve somar e manter precisão com números grandes', () => {
        const a = Money.from({ amount: '9999999999.99', currency: 'BRL' });
        const b = Money.from({ amount: '0.01', currency: 'BRL' });
        const result = a.add(b);
        expect(result.toJSON()).toEqual({ amount: '10000000000.00', currency: 'BRL' });
      });

      it('deve rejeitar soma com moedas diferentes', () => {
        const a = Money.from({ amount: '100.00', currency: 'BRL' });
        const b = Money.from({ amount: '50.00', currency: 'USD' });
        expect(() => a.add(b)).toThrow(CurrencyMismatchError);
      });
    });

    describe('subtract()', () => {
      it('deve subtrair dois valores na mesma moeda', () => {
        const a = Money.from({ amount: '100.00', currency: 'BRL' });
        const b = Money.from({ amount: '30.00', currency: 'BRL' });
        const result = a.subtract(b);
        expect(result.toJSON()).toEqual({ amount: '70.00', currency: 'BRL' });
      });

      it('deve subtrair e manter precisão', () => {
        const a = Money.from({ amount: '0.30', currency: 'BRL' });
        const b = Money.from({ amount: '0.20', currency: 'BRL' });
        const result = a.subtract(b);
        expect(result.toJSON()).toEqual({ amount: '0.10', currency: 'BRL' });
      });

      it('deve permitir subtração que resulta em negativo', () => {
        const a = Money.from({ amount: '100.00', currency: 'BRL' });
        const b = Money.from({ amount: '150.00', currency: 'BRL' });
        const result = a.subtract(b);

        expect(result.toJSON()).toEqual({ amount: '-50.00', currency: 'BRL' });
        expect(result.isNegative()).toBe(true);
      });

      it('deve permitir subtração que resulta em zero', () => {
        const a = Money.from({ amount: '100.00', currency: 'BRL' });
        const b = Money.from({ amount: '100.00', currency: 'BRL' });
        const result = a.subtract(b);
        expect(result.toJSON()).toEqual({ amount: '0.00', currency: 'BRL' });
        expect(result.isZero()).toBe(true);
      });

      it('deve rejeitar subtração com moedas diferentes', () => {
        const a = Money.from({ amount: '100.00', currency: 'BRL' });
        const b = Money.from({ amount: '50.00', currency: 'USD' });
        expect(() => a.subtract(b)).toThrow(CurrencyMismatchError);
      });
    });

    describe('negate()', () => {
      it('deve inverter o sinal do valor', () => {
        const money = Money.from({ amount: '100.00', currency: 'BRL' });
        const negated = money.negate();

        expect(negated.toJSON()).toEqual({ amount: '-100.00', currency: 'BRL' });
        expect(negated.isNegative()).toBe(true);
      });

      it('deve inverter o sinal de valor negativo', () => {
        const money = Money.from({ amount: '100.00', currency: 'BRL' }).negate();
        const negated = money.negate();

        expect(negated.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
        expect(negated.isNegative()).toBe(false);
      });

      it('deve inverter o sinal de zero', () => {
        const zero = Money.zero('BRL');
        const negated = zero.negate();

        expect(negated.toJSON()).toEqual({ amount: '0.00', currency: 'BRL' });
        expect(negated.isZero()).toBe(true);
      });

      it('deve manter imutabilidade ao negativar', () => {
        const original = Money.from({ amount: '100.00', currency: 'BRL' });
        const negated = original.negate();

        expect(original.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
        expect(negated.toJSON()).toEqual({ amount: '-100.00', currency: 'BRL' });
        expect(original).not.toBe(negated);
      });
    });
  });

  describe('comparações', () => {
    it('deve verificar se é zero', () => {
      const zero = Money.zero('BRL');
      const positive = Money.from({ amount: '100.00', currency: 'BRL' });

      expect(zero.isZero()).toBe(true);
      expect(positive.isZero()).toBe(false);
    });

    it('deve verificar se é positivo', () => {
      const positive = Money.from({ amount: '100.00', currency: 'BRL' });
      const negative = positive.negate();
      const zero = Money.zero('BRL');

      expect(positive.isPositive()).toBe(true);
      expect(negative.isPositive()).toBe(false);
      expect(zero.isPositive()).toBe(false);
    });

    it('deve verificar se é negativo', () => {
      const positive = Money.from({ amount: '100.00', currency: 'BRL' });
      const negative = positive.negate();
      const zero = Money.zero('BRL');

      expect(negative.isNegative()).toBe(true);
      expect(positive.isNegative()).toBe(false);
      expect(zero.isNegative()).toBe(false);
    });

    it('deve verificar igualdade', () => {
      const a = Money.from({ amount: '100.00', currency: 'BRL' });
      const b = Money.from({ amount: '100.00', currency: 'BRL' });
      const c = Money.from({ amount: '100.00', currency: 'USD' });
      const d = Money.from({ amount: '150.00', currency: 'BRL' });

      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
      expect(a.equals(d)).toBe(false);
    });

    it('deve comparar se é menor que', () => {
      const a = Money.from({ amount: '100.00', currency: 'BRL' });
      const b = Money.from({ amount: '150.00', currency: 'BRL' });
      const c = a.negate();

      expect(a.isLessThan(b)).toBe(true);
      expect(b.isLessThan(a)).toBe(false);
      expect(c.isLessThan(a)).toBe(true);
    });

    it('deve comparar se é menor ou igual', () => {
      const a = Money.from({ amount: '100.00', currency: 'BRL' });
      const b = Money.from({ amount: '100.00', currency: 'BRL' });
      const c = Money.from({ amount: '150.00', currency: 'BRL' });

      expect(a.isLessThanOrEqual(b)).toBe(true);
      expect(a.isLessThanOrEqual(c)).toBe(true);
      expect(c.isLessThanOrEqual(a)).toBe(false);
    });

    it('deve comparar se é maior que', () => {
      const a = Money.from({ amount: '100.00', currency: 'BRL' });
      const b = Money.from({ amount: '150.00', currency: 'BRL' });

      expect(b.isGreaterThan(a)).toBe(true);
      expect(a.isGreaterThan(b)).toBe(false);
    });

    it('deve comparar se é maior ou igual', () => {
      const a = Money.from({ amount: '100.00', currency: 'BRL' });
      const b = Money.from({ amount: '100.00', currency: 'BRL' });
      const c = Money.from({ amount: '150.00', currency: 'BRL' });

      expect(a.isGreaterThanOrEqual(b)).toBe(true);
      expect(c.isGreaterThanOrEqual(a)).toBe(true);
      expect(a.isGreaterThanOrEqual(c)).toBe(false);
    });

    it('deve rejeitar comparação com moedas diferentes', () => {
      const a = Money.from({ amount: '100.00', currency: 'BRL' });
      const b = Money.from({ amount: '150.00', currency: 'USD' });

      expect(() => a.isLessThan(b)).toThrow(CurrencyMismatchError);
      expect(() => a.isGreaterThan(b)).toThrow(CurrencyMismatchError);
      expect(() => a.isLessThanOrEqual(b)).toThrow(CurrencyMismatchError);
      expect(() => a.isGreaterThanOrEqual(b)).toThrow(CurrencyMismatchError);
    });
  });

  describe('serialização', () => {
    it('deve serializar para JSON com 2 casas decimais', () => {
      const money = Money.from({ amount: '100.5', currency: 'BRL' });
      expect(money.toJSON()).toEqual({ amount: '100.50', currency: 'BRL' });
    });

    it('deve serializar para JSON com valor negativo', () => {
      const money = Money.from({ amount: '100.00', currency: 'BRL' }).negate();
      expect(money.toJSON()).toEqual({ amount: '-100.00', currency: 'BRL' });
    });

    it('deve serializar para string', () => {
      const money = Money.from({ amount: '100.00', currency: 'BRL' });
      expect(money.toString()).toBe('100.00 BRL');
    });

    it('deve serializar para string com valor negativo', () => {
      const money = Money.from({ amount: '100.00', currency: 'BRL' }).negate();
      expect(money.toString()).toBe('-100.00 BRL');
    });

    it('deve retornar o amount como string', () => {
      const money = Money.from({ amount: '100.00', currency: 'BRL' });
      expect(money.toAmountString()).toBe('100.00');
    });

    it('deve retornar o amount como string com valor negativo', () => {
      const money = Money.from({ amount: '100.00', currency: 'BRL' }).negate();
      expect(money.toAmountString()).toBe('-100.00');
    });
  });

  describe('imutabilidade', () => {
    it('deve ser imutável - add retorna nova instância', () => {
      const original = Money.from({ amount: '100.00', currency: 'BRL' });
      const result = original.add(Money.from({ amount: '50.00', currency: 'BRL' }));

      expect(original.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
      expect(result.toJSON()).toEqual({ amount: '150.00', currency: 'BRL' });
      expect(original).not.toBe(result);
    });

    it('deve ser imutável - subtract retorna nova instância', () => {
      const original = Money.from({ amount: '100.00', currency: 'BRL' });
      const result = original.subtract(Money.from({ amount: '30.00', currency: 'BRL' }));

      expect(original.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
      expect(result.toJSON()).toEqual({ amount: '70.00', currency: 'BRL' });
      expect(original).not.toBe(result);
    });

    it('deve ser imutável - negate retorna nova instância', () => {
      const original = Money.from({ amount: '100.00', currency: 'BRL' });
      const result = original.negate();

      expect(original.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
      expect(result.toJSON()).toEqual({ amount: '-100.00', currency: 'BRL' });
      expect(original).not.toBe(result);
    });
  });

  describe('casos de uso reais', () => {
    it('deve calcular saldo após débitos', () => {
      const saldoInicial = Money.from({ amount: '1000.00', currency: 'BRL' });
      const aposta1 = Money.from({ amount: '25.50', currency: 'BRL' });
      const aposta2 = Money.from({ amount: '30.00', currency: 'BRL' });

      let saldo = saldoInicial;
      saldo = saldo.subtract(aposta1);
      saldo = saldo.subtract(aposta2);

      expect(saldo.toJSON()).toEqual({ amount: '944.50', currency: 'BRL' });
    });

    it('deve permitir saldo negativo após débitos', () => {
      const saldo = Money.from({ amount: '100.00', currency: 'BRL' });
      const aposta = Money.from({ amount: '150.00', currency: 'BRL' });

      const resultado = saldo.subtract(aposta);
      expect(resultado.toJSON()).toEqual({ amount: '-50.00', currency: 'BRL' });
      expect(resultado.isNegative()).toBe(true);
    });

    it('deve permitir múltiplos créditos', () => {
      let saldo = Money.zero('BRL');
      const credito1 = Money.from({ amount: '100.00', currency: 'BRL' });
      const credito2 = Money.from({ amount: '50.50', currency: 'BRL' });

      saldo = saldo.add(credito1);
      saldo = saldo.add(credito2);

      expect(saldo.toJSON()).toEqual({ amount: '150.50', currency: 'BRL' });
    });

    it('deve lidar com valores quebrados corretamente (sem erro de float)', () => {
      const a = Money.from({ amount: '0.01', currency: 'BRL' });
      const b = Money.from({ amount: '0.02', currency: 'BRL' });
      const c = Money.from({ amount: '0.03', currency: 'BRL' });

      const result = a.add(b).add(c);
      expect(result.toJSON()).toEqual({ amount: '0.06', currency: 'BRL' });
    });

    it('deve lidar com reversão de apostas (refund)', () => {
      const saldo = Money.from({ amount: '500.00', currency: 'BRL' });
      const aposta = Money.from({ amount: '100.00', currency: 'BRL' });

      let novoSaldo = saldo.subtract(aposta);
      expect(novoSaldo.toJSON()).toEqual({ amount: '400.00', currency: 'BRL' });

      novoSaldo = novoSaldo.add(aposta);
      expect(novoSaldo.toJSON()).toEqual({ amount: '500.00', currency: 'BRL' });
    });

    it('deve comparar saldos corretamente', () => {
      const saldo = Money.from({ amount: '100.00', currency: 'BRL' });
      const aposta = Money.from({ amount: '150.00', currency: 'BRL' });

      const resultado = saldo.subtract(aposta);

      expect(resultado.isNegative()).toBe(true);
      expect(resultado.isLessThan(Money.zero('BRL'))).toBe(true);
      expect(saldo.isGreaterThan(resultado)).toBe(true);
    });
  });
});
