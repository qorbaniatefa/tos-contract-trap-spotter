import { expect, it } from 'vitest';
import { evaluateFindings } from '../eval/metrics';
import type { Finding } from '../src/analysis/pipeline';

const finding = (start: number, end: number) =>
  ({ category: 'autoRenewal', start, end }) as Finding;
it('matches evidence and category one-to-one, with explicit misses and false alarms', () => {
  const result = evaluateFindings(
    [finding(0, 12), finding(25, 30), finding(40, 50)],
    [
      { label: 'positive', category: 'autoRenewal', start: 0, end: 15 },
      { label: 'positive', category: 'refundRestriction', start: 25, end: 30 },
      { label: 'negative', category: 'autoRenewal', start: 40, end: 50 },
    ],
  );
  expect(result.tp).toBe(1);
  expect(result.fp).toBe(2);
  expect(result.fn).toBe(1);
  expect(result.precision).toBeCloseTo(1 / 3);
  expect(result.recall).toBe(0.5);
});
it('uses maximum one-to-one matching rather than a fragile greedy match', () => {
  const result = evaluateFindings(
    [finding(0, 30), finding(0, 10)],
    [
      { label: 'positive', category: 'autoRenewal', start: 0, end: 10 },
      { label: 'positive', category: 'autoRenewal', start: 20, end: 30 },
    ],
  );
  expect(result.tp).toBe(2);
  expect(result.fp).toBe(0);
  expect(result.fn).toBe(0);
});
