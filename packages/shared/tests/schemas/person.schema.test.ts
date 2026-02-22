import { describe, expect, it } from 'vitest';
import { Gender } from '../../src/types/person';
import { createPersonSchema, updatePersonSchema } from '../../src/schemas/person.schema';

describe('createPersonSchema', () => {
  const validInput = {
    firstName: 'John',
    lastName: 'Doe',
    gender: Gender.MALE,
  };

  it('accepts valid minimal input', () => {
    const result = createPersonSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts full input with all optional fields', () => {
    const result = createPersonSchema.safeParse({
      ...validInput,
      birthDate: '1990-05-15',
      birthPlace: 'New York, NY',
      deathDate: '2060-01-01',
      deathPlace: 'Los Angeles, CA',
      biography: 'A brief biography.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty firstName', () => {
    const result = createPersonSchema.safeParse({ ...validInput, firstName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty lastName', () => {
    const result = createPersonSchema.safeParse({ ...validInput, lastName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid gender', () => {
    const result = createPersonSchema.safeParse({ ...validInput, gender: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid date format', () => {
    const result = createPersonSchema.safeParse({ ...validInput, birthDate: '15/05/1990' });
    expect(result.success).toBe(false);
  });

  it('accepts year-only date', () => {
    const result = createPersonSchema.safeParse({ ...validInput, birthDate: '1715' });
    expect(result.success).toBe(true);
  });

  it('accepts year-month date', () => {
    const result = createPersonSchema.safeParse({ ...validInput, birthDate: '1883-09' });
    expect(result.success).toBe(true);
  });

  it('trims whitespace from strings', () => {
    const result = createPersonSchema.safeParse({
      ...validInput,
      firstName: '  John  ',
      lastName: '  Doe  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe('John');
      expect(result.data.lastName).toBe('Doe');
    }
  });

  it('rejects biography over 5000 chars', () => {
    const result = createPersonSchema.safeParse({
      ...validInput,
      biography: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});

describe('updatePersonSchema', () => {
  it('accepts partial updates', () => {
    const result = updatePersonSchema.safeParse({ firstName: 'Jane' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (no changes)', () => {
    const result = updatePersonSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts profilePhotoS3Key', () => {
    const result = updatePersonSchema.safeParse({ profilePhotoS3Key: 'photos/abc/123.jpg' });
    expect(result.success).toBe(true);
  });
});
