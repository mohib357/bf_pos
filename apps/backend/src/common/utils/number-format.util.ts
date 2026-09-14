import Decimal from 'decimal.js';

/**
 * Financial calculation utilities
 * Uses Decimal.js to avoid floating point errors
 */

export function toDecimal(value: any): Decimal {
  return new Decimal(value?.toString() || '0');
}

export function addDecimals(...values: any[]): Decimal {
  return values.reduce(
    (sum: Decimal, val) => sum.plus(toDecimal(val)),
    new Decimal(0),
  );
}

export function subtractDecimals(a: any, b: any): Decimal {
  return toDecimal(a).minus(toDecimal(b));
}

export function multiplyDecimals(a: any, b: any): Decimal {
  return toDecimal(a).times(toDecimal(b));
}

export function divideDecimals(a: any, b: any): Decimal {
  if (toDecimal(b).isZero()) return new Decimal(0);
  return toDecimal(a).dividedBy(toDecimal(b));
}

export function roundMoney(value: any, places = 2): string {
  return toDecimal(value).toFixed(places, Decimal.ROUND_HALF_UP);
}

export function calculateDiscountAmount(
  amount: Decimal | number | string,
  discountRate: Decimal | number | string,
): Decimal {
  const rate = toDecimal(discountRate).dividedBy(100);
  return toDecimal(amount).times(rate);
}

export function calculateTaxAmount(
  amount: Decimal | number | string,
  taxRate: Decimal | number | string,
): Decimal {
  const rate = toDecimal(taxRate).dividedBy(100);
  return toDecimal(amount).times(rate);
}

/**
 * Format number in Bengali locale
 */
export function formatBangladeshiCurrency(amount: number | string): string {
  const num = parseFloat(amount.toString());
  return new Intl.NumberFormat('bn-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 2,
  }).format(num);
}

export function formatCurrency(amount: number | string): string {
  const num = parseFloat(amount.toString());
  return new Intl.NumberFormat('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}
