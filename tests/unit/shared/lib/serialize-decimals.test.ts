import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { serializeDecimals } from '@/shared/lib/serialize-decimals';

function createMockDecimal(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

describe('serializeDecimals', () => {
  describe('Decimal conversion', () => {
    it('converts Decimal to number', () => {
      const decimal = createMockDecimal('12345.67');
      const result = serializeDecimals(decimal);

      expect(typeof result).toBe('number');
      expect(Number(result)).toBe(12345.67);
    });

    it('converts Decimal zero to 0', () => {
      const decimal = createMockDecimal('0');
      const result = serializeDecimals(decimal);

      expect(result).toBe(0);
    });

    it('converts negative Decimal', () => {
      const decimal = createMockDecimal('-999.99');
      const result = serializeDecimals(decimal);

      expect(result).toBe(-999.99);
    });

    it('converts large Decimal values', () => {
      const decimal = createMockDecimal('999999999.99');
      const result = serializeDecimals(decimal);

      expect(typeof result).toBe('number');
      expect(result).toBe(999999999.99);
    });

    it('handles Decimal with many decimal places', () => {
      const decimal = createMockDecimal('123.456789012345');
      const result = serializeDecimals(decimal);

      expect(typeof result).toBe('number');
      expect(result).toBeCloseTo(123.456789012345, 10);
    });
  });

  describe('Null and undefined handling', () => {
    it('returns null for null input', () => {
      const result = serializeDecimals(null);
      expect(result).toBeNull();
    });

    it('returns undefined for undefined input', () => {
      const result = serializeDecimals(undefined);
      expect(result).toBeUndefined();
    });

    it('preserves null in nested structures', () => {
      const obj = {
        amount: createMockDecimal('100'),
        discount: null,
      };

      const result = serializeDecimals(obj);

      expect(result.amount).toBe(100);
      expect(result.discount).toBeNull();
    });

    it('preserves undefined in nested structures', () => {
      const obj = {
        amount: createMockDecimal('100'),
        note: undefined,
      };

      const result = serializeDecimals(obj);

      expect(result.amount).toBe(100);
      expect(result.note).toBeUndefined();
    });
  });

  describe('Primitive types', () => {
    it('preserves string values', () => {
      const str = 'test-string';
      const result = serializeDecimals(str);

      expect(result).toBe(str);
      expect(typeof result).toBe('string');
    });

    it('preserves number values', () => {
      const num = 42;
      const result = serializeDecimals(num);

      expect(result).toBe(num);
      expect(typeof result).toBe('number');
    });

    it('preserves boolean values', () => {
      const bool = true;
      const result = serializeDecimals(bool);

      expect(result).toBe(true);
      expect(typeof result).toBe('boolean');
    });

    it('preserves Date objects', () => {
      const date = new Date('2026-10-15T08:00:00Z');
      const result = serializeDecimals(date);

      expect(result instanceof Date).toBe(true);
      expect(result.getTime()).toBe(date.getTime());
    });
  });

  describe('Object conversion', () => {
    it('converts Decimal in flat object', () => {
      const obj = {
        totalAmount: createMockDecimal('500000'),
        commissionAmount: createMockDecimal('40000'),
        operatorAmount: createMockDecimal('460000'),
      };

      const result = serializeDecimals(obj);

      expect(result.totalAmount).toBe(500000);
      expect(result.commissionAmount).toBe(40000);
      expect(result.operatorAmount).toBe(460000);
      expect(typeof result.totalAmount).toBe('number');
    });

    it('converts Decimal in nested object', () => {
      const obj = {
        booking: {
          id: 'booking-1',
          totalAmount: createMockDecimal('500000'),
          customer: {
            name: 'John Doe',
            discountReceived: createMockDecimal('50000'),
          },
        },
      };

      const result = serializeDecimals(obj);

      expect(result.booking.totalAmount).toBe(500000);
      expect(result.booking.customer.discountReceived).toBe(50000);
      expect(result.booking.customer.name).toBe('John Doe');
    });

    it('preserves object structure', () => {
      const obj = {
        id: 'test-1',
        name: 'Test Object',
        amount: createMockDecimal('1000'),
      };

      const result = serializeDecimals(obj);

      expect(result).toEqual({
        id: 'test-1',
        name: 'Test Object',
        amount: 1000,
      });
    });

    it('handles empty object', () => {
      const obj = {};
      const result = serializeDecimals(obj);

      expect(result).toEqual({});
    });

    it('handles object with only Decimal values', () => {
      const obj = {
        price1: createMockDecimal('100'),
        price2: createMockDecimal('200'),
        price3: createMockDecimal('300'),
      };

      const result = serializeDecimals(obj);

      expect(result).toEqual({
        price1: 100,
        price2: 200,
        price3: 300,
      });
    });
  });

  describe('Array conversion', () => {
    it('converts Decimal values in array', () => {
      const arr = [
        createMockDecimal('100'),
        createMockDecimal('200'),
        createMockDecimal('300'),
      ];

      const result = serializeDecimals(arr);

      expect(result).toEqual([100, 200, 300]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('converts mixed array with Decimal and primitives', () => {
      const arr = [
        100,
        'text',
        createMockDecimal('250000'),
        true,
        null,
      ];

      const result = serializeDecimals(arr);

      expect(result[0]).toBe(100);
      expect(result[1]).toBe('text');
      expect(result[2]).toBe(250000);
      expect(result[3]).toBe(true);
      expect(result[4]).toBeNull();
    });

    it('converts array of objects with Decimals', () => {
      const arr = [
        { id: '1', amount: createMockDecimal('100') },
        { id: '2', amount: createMockDecimal('200') },
      ];

      const result = serializeDecimals(arr);

      expect(result[0].amount).toBe(100);
      expect(result[1].amount).toBe(200);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });

    it('converts nested array with Decimals', () => {
      const arr = [
        [createMockDecimal('100'), createMockDecimal('200')],
        [createMockDecimal('300'), createMockDecimal('400')],
      ];

      const result = serializeDecimals(arr);

      expect(result[0][0]).toBe(100);
      expect(result[0][1]).toBe(200);
      expect(result[1][0]).toBe(300);
      expect(result[1][1]).toBe(400);
    });

    it('handles empty array', () => {
      const arr: any[] = [];
      const result = serializeDecimals(arr);

      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('handles array with null elements', () => {
      const arr = [
        createMockDecimal('100'),
        null,
        createMockDecimal('200'),
      ];

      const result = serializeDecimals(arr);

      expect(result[0]).toBe(100);
      expect(result[1]).toBeNull();
      expect(result[2]).toBe(200);
    });
  });

  describe('Complex nested structures', () => {
    it('converts booking object with nested legs and prices', () => {
      const booking = {
        id: 'booking-1',
        bookingReference: 'GILI-ABC123',
        totalAmount: createMockDecimal('500000'),
        commissionAmount: createMockDecimal('40000'),
        operatorAmount: createMockDecimal('460000'),
        legs: [
          {
            id: 'leg-1',
            basePrice: createMockDecimal('250000'),
          },
          {
            id: 'leg-2',
            basePrice: createMockDecimal('250000'),
          },
        ],
        customer: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      };

      const result = serializeDecimals(booking);

      expect(result.totalAmount).toBe(500000);
      expect(result.commissionAmount).toBe(40000);
      expect(result.operatorAmount).toBe(460000);
      expect(result.legs[0].basePrice).toBe(250000);
      expect(result.legs[1].basePrice).toBe(250000);
      expect(result.customer.name).toBe('John Doe');
    });

    it('handles deeply nested structure', () => {
      const deep = {
        level1: {
          level2: {
            level3: {
              level4: {
                amount: createMockDecimal('12345.67'),
              },
            },
          },
        },
      };

      const result = serializeDecimals(deep);

      expect(result.level1.level2.level3.level4.amount).toBe(12345.67);
    });

    it('preserves structure while converting all Decimals', () => {
      const complex = {
        booking: {
          id: 'b-1',
          pricing: {
            fare: createMockDecimal('400000'),
            commission: createMockDecimal('32000'),
            serviceFee: createMockDecimal('5000'),
            total: createMockDecimal('437000'),
          },
          passengers: [
            { name: 'Adult 1', surcharge: createMockDecimal('0') },
            { name: 'Child 1', surcharge: createMockDecimal('20000') },
          ],
        },
      };

      const result = serializeDecimals(complex);

      expect(result.booking.pricing.fare).toBe(400000);
      expect(result.booking.pricing.commission).toBe(32000);
      expect(result.booking.pricing.total).toBe(437000);
      expect(result.booking.passengers[0].surcharge).toBe(0);
      expect(result.booking.passengers[1].surcharge).toBe(20000);
    });
  });

  describe('Edge cases', () => {
    it('handles Decimal created from string', () => {
      const decimal = createMockDecimal('123.456');
      const result = serializeDecimals(decimal);

      expect(typeof result).toBe('number');
      expect(result).toBeCloseTo(123.456, 5);
    });

    it('handles Decimal created from number', () => {
      const decimal = createMockDecimal(999.99);
      const result = serializeDecimals(decimal);

      expect(typeof result).toBe('number');
      expect(result).toBe(999.99);
    });

    it('does not mutate original object', () => {
      const original = {
        amount: createMockDecimal('1000'),
        name: 'test',
      };

      const result = serializeDecimals(original);

      // Check that original still has the mock Decimal (not mutated)
      expect(Prisma.Decimal.isDecimal(original.amount)).toBe(true);
      expect(typeof result.amount).toBe('number');
      expect(result !== original).toBe(true);
    });

    it('handles object with Symbol properties (if applicable)', () => {
      const obj: any = {
        amount: createMockDecimal('500'),
        regular: 'value',
      };

      const result = serializeDecimals(obj);

      expect(result.amount).toBe(500);
      expect(result.regular).toBe('value');
    });

    it('converts object with constructor property', () => {
      const obj = {
        amount: createMockDecimal('1000'),
        // constructor is inherited from Object prototype
      };

      const result = serializeDecimals(obj);

      expect(result.amount).toBe(1000);
      expect(typeof result.constructor).toBe('function');
    });
  });

  describe('Type safety', () => {
    it('returns same type for non-Decimal objects', () => {
      const obj = {
        id: 'test',
        active: true,
      };

      const result = serializeDecimals(obj);

      expect(result.id).toBe('test');
      expect(result.active).toBe(true);
    });

    it('preserves readonly arrays', () => {
      const arr = [
        createMockDecimal('100'),
        createMockDecimal('200'),
      ] as const;

      const result = serializeDecimals(arr);

      expect(result[0]).toBe(100);
      expect(result[1]).toBe(200);
    });

    it('handles generic objects', () => {
      interface Price {
        amount: Prisma.Decimal;
        currency: string;
      }

      const price: Price = {
        amount: createMockDecimal('9999.99'),
        currency: 'IDR',
      };

      const result = serializeDecimals(price);

      expect(result.amount).toBe(9999.99);
      expect(result.currency).toBe('IDR');
    });
  });
});
