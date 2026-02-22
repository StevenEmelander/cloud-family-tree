import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validate } from '../../src/utils/validation.utils';

const testSchema = z.object({
  name: z.string().min(1),
  age: z.number().positive(),
  email: z.string().email().optional(),
});

describe('validate', () => {
  it('returns success with valid data', () => {
    const result = validate(testSchema, { name: 'John', age: 30 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'John', age: 30 });
    expect(result.errors).toBeUndefined();
  });

  it('returns success with optional fields', () => {
    const result = validate(testSchema, { name: 'John', age: 30, email: 'john@example.com' });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('john@example.com');
  });

  it('returns errors for invalid data', () => {
    const result = validate(testSchema, { name: '', age: -1 });
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('returns errors for missing required fields', () => {
    const result = validate(testSchema, {});
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('includes field path in error messages', () => {
    const result = validate(testSchema, { name: 'John', age: 'not a number' });
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes('age'))).toBe(true);
  });
});
