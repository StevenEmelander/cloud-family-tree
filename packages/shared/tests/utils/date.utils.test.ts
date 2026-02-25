import { describe, expect, it } from 'vitest';
import { isoNow, isValidIsoDate } from '../../src/utils/date.utils';

describe('isoNow', () => {
  it('returns a valid ISO 8601 timestamp', () => {
    const result = isoNow();
    expect(new Date(result).toISOString()).toBe(result);
  });

  it('returns a recent timestamp', () => {
    const before = Date.now();
    const result = isoNow();
    const after = Date.now();
    const ts = new Date(result).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('isValidIsoDate', () => {
  it('accepts valid YYYY-MM-DD dates', () => {
    expect(isValidIsoDate('2024-01-15')).toBe(true);
    expect(isValidIsoDate('1900-12-31')).toBe(true);
    expect(isValidIsoDate('2000-06-01')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isValidIsoDate('01-15-2024')).toBe(false);
    expect(isValidIsoDate('2024/01/15')).toBe(false);
    expect(isValidIsoDate('2024-1-15')).toBe(false);
    expect(isValidIsoDate('not-a-date')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });

  it('rejects invalid date values', () => {
    expect(isValidIsoDate('2024-13-01')).toBe(false);
    expect(isValidIsoDate('2024-00-01')).toBe(false);
  });
});
