import { describe, test, expect } from '@jest/globals';
import {
  mean, variance, stdDev, percentile, median, confidenceInterval95, welchTTest, tTestPValueTwoSided,
} from '../../scripts/stats/statistics.mjs';

describe('basic statistics', () => {
  const data = [2, 4, 4, 4, 5, 5, 7, 9];
  test('mean', () => expect(mean(data)).toBe(5));
  test('sample variance and std dev', () => {
    expect(variance(data)).toBeCloseTo(4.571, 3);
    expect(stdDev(data)).toBeCloseTo(2.138, 3);
  });
  test('median and percentiles', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 0)).toBe(10);
    expect(percentile([10, 20, 30, 40, 50], 100)).toBe(50);
    expect(percentile([10, 20, 30, 40, 50], 90)).toBe(46);
  });
  test('95% confidence interval contains the mean', () => {
    const ci = confidenceInterval95(data);
    expect(ci.lower).toBeLessThan(5);
    expect(ci.upper).toBeGreaterThan(5);
  });
});

describe('t-test', () => {
  test('p-value matches the t table (t=2.228, df=10 → p≈0.05)', () => {
    expect(tTestPValueTwoSided(2.228, 10)).toBeCloseTo(0.05, 3);
  });
  test('clearly different samples are significant', () => {
    const fast = [10, 11, 12, 10, 11, 12, 10, 11];
    const slow = [30, 31, 29, 32, 30, 31, 29, 30];
    expect(welchTTest(fast, slow).significant).toBe(true);
  });
  test('identical samples are not significant', () => {
    const a = [10, 12, 11, 13, 10, 12];
    expect(welchTTest(a, [...a]).significant).toBe(false);
  });
});
