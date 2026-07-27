import { differenceInDays } from './date';

export interface ProrationResult {
  termDays: number;
  remainingDays: number;
  annualPremiumDeltaCents: number;
  proratedDeltaCents: number;
}

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer.`);
  }
}

export function roundFractionHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error('Denominator must be positive.');
  }

  const sign = numerator < 0n ? -1n : 1n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const quotient = absoluteNumerator / denominator;
  const remainder = absoluteNumerator % denominator;
  const roundedMagnitude = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return roundedMagnitude * sign;
}

export function calculateProration(input: {
  termStart: string;
  termEnd: string;
  effectiveDate: string;
  oldAnnualPremiumCents: number;
  newAnnualPremiumCents: number;
}): ProrationResult {
  assertSafeInteger(input.oldAnnualPremiumCents, 'oldAnnualPremiumCents');
  assertSafeInteger(input.newAnnualPremiumCents, 'newAnnualPremiumCents');

  const termDays = differenceInDays(input.termStart, input.termEnd);
  const remainingDays = differenceInDays(input.effectiveDate, input.termEnd);

  if (termDays <= 0) {
    throw new Error('Policy term must contain at least one day.');
  }
  if (remainingDays <= 0 || remainingDays > termDays) {
    throw new Error('Effective date must be inside the policy term.');
  }

  const annualPremiumDeltaCents =
    input.newAnnualPremiumCents - input.oldAnnualPremiumCents;
  const proratedDelta = roundFractionHalfAwayFromZero(
    BigInt(annualPremiumDeltaCents) * BigInt(remainingDays),
    BigInt(termDays),
  );
  const proratedDeltaCents = Number(proratedDelta);
  assertSafeInteger(proratedDeltaCents, 'proratedDeltaCents');

  return {
    termDays,
    remainingDays,
    annualPremiumDeltaCents,
    proratedDeltaCents,
  };
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}
