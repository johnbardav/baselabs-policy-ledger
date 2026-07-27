import {
  calculateProration,
  roundFractionHalfAwayFromZero,
} from '../../src/common/utils/money';

describe('proration', () => {
  it('calculates the assessment sample to 12,099 cents', () => {
    expect(
      calculateProration({
        termStart: '2026-01-01',
        termEnd: '2027-01-01',
        effectiveDate: '2026-07-01',
        oldAnnualPremiumCents: 120000,
        newAnnualPremiumCents: 144000,
      }),
    ).toEqual({
      termDays: 365,
      remainingDays: 184,
      annualPremiumDeltaCents: 24000,
      proratedDeltaCents: 12099,
    });
  });

  it('rounds negative adjustments half away from zero', () => {
    expect(roundFractionHalfAwayFromZero(-1n, 2n)).toBe(-1n);
    expect(roundFractionHalfAwayFromZero(-4n, 3n)).toBe(-1n);
    expect(roundFractionHalfAwayFromZero(-5n, 3n)).toBe(-2n);
  });

  it('supports negative premium deltas', () => {
    const result = calculateProration({
      termStart: '2026-01-01',
      termEnd: '2027-01-01',
      effectiveDate: '2026-07-01',
      oldAnnualPremiumCents: 144000,
      newAnnualPremiumCents: 120000,
    });
    expect(result.proratedDeltaCents).toBe(-12099);
  });

  it('rejects an effective date outside the term', () => {
    expect(() =>
      calculateProration({
        termStart: '2026-01-01',
        termEnd: '2027-01-01',
        effectiveDate: '2027-01-01',
        oldAnnualPremiumCents: 120000,
        newAnnualPremiumCents: 144000,
      }),
    ).toThrow('Effective date must be inside the policy term.');
  });
});
