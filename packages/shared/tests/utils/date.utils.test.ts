import { describe, expect, it } from 'vitest';
import { isoNow } from '../../src/utils/date.utils';

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
