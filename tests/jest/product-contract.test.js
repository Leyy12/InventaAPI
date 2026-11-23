import { describe, test, expect } from '@jest/globals';
import {
  normalizeDisplayText, normalizeSku, normalizeSegment, evaluateProductVisibility,
} from '../../services/product-contract.js';

describe('normalizeDisplayText', () => {
  test('trims and collapses whitespace', () => {
    expect(normalizeDisplayText('  Coca   Cola  ')).toBe('Coca Cola');
  });
  test('returns null for empty or non-string input', () => {
    expect(normalizeDisplayText('   ')).toBeNull();
    expect(normalizeDisplayText(42)).toBeNull();
    expect(normalizeDisplayText(null)).toBeNull();
  });
});

describe('normalizeSku', () => {
  test('uppercases a real SKU', () => {
    expect(normalizeSku(' abc-123 ')).toBe('ABC-123');
  });
  test.each(['n/a', 'N/A', 'none', '-', 'unknown', 'no sku'])('treats placeholder "%s" as no SKU', value => {
    expect(normalizeSku(value)).toBeNull();
  });
});

describe('normalizeSegment', () => {
  test.each([
    ['grocery', 'Grocery'], ['Food', 'Grocery'], ['drugstore', 'Pharmacy'],
    ['MEDICINE', 'Pharmacy'], ['tools', 'Hardware'], ['Hardware Store', 'Hardware'],
  ])('"%s" maps to %s', (input, expected) => {
    expect(normalizeSegment(input)).toBe(expected);
  });
  test('unknown segment returns null', () => {
    expect(normalizeSegment('electronics')).toBeNull();
  });
});

describe('evaluateProductVisibility', () => {
  test('active status is visible', () => {
    expect(evaluateProductVisibility({ status: 'active' })).toEqual({ visible: true, reason: 'positive_status' });
  });
  test('positive flag is visible', () => {
    expect(evaluateProductVisibility({ is_active: true }).visible).toBe(true);
  });
  test('archived product is hidden even when status is active', () => {
    expect(evaluateProductVisibility({ status: 'active', archived: true })).toEqual({ visible: false, reason: 'archived' });
  });
  test('draft status is hidden', () => {
    expect(evaluateProductVisibility({ status: 'draft' }).visible).toBe(false);
  });
  test('product with no publication signal is hidden (fail-closed)', () => {
    expect(evaluateProductVisibility({ name: 'Rice' })).toEqual({ visible: false, reason: 'no_publication_signal' });
  });
  test('malformed flag is hidden', () => {
    expect(evaluateProductVisibility({ is_active: 'yes' }).visible).toBe(false);
  });
  test('non-object input is hidden', () => {
    expect(evaluateProductVisibility(null).visible).toBe(false);
    expect(evaluateProductVisibility([]).visible).toBe(false);
  });
});
