import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEntrySchema, updateEntrySchema } from '../../src/schemas/entry.schema';

describe('createEntrySchema', () => {
  const validInput = {
    personId: randomUUID(),
    content: 'Hello world',
  };

  it('accepts valid input with default entryType', () => {
    const result = createEntrySchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entryType).toBe('wall');
    }
  });

  it('accepts SITE as personId', () => {
    const result = createEntrySchema.safeParse({ ...validInput, personId: 'SITE' });
    expect(result.success).toBe(true);
  });

  it('accepts all valid entry types', () => {
    for (const entryType of ['wall', 'issue', 'bug'] as const) {
      const result = createEntrySchema.safeParse({ ...validInput, entryType });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid personId', () => {
    const result = createEntrySchema.safeParse({ ...validInput, personId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects empty content', () => {
    const result = createEntrySchema.safeParse({ ...validInput, content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects content over 2000 characters', () => {
    const result = createEntrySchema.safeParse({ ...validInput, content: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid entry type', () => {
    const result = createEntrySchema.safeParse({ ...validInput, entryType: 'comment' });
    expect(result.success).toBe(false);
  });
});

describe('updateEntrySchema', () => {
  it('accepts valid content', () => {
    const result = updateEntrySchema.safeParse({ content: 'Updated content' });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = updateEntrySchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects content over 2000 characters', () => {
    const result = updateEntrySchema.safeParse({ content: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });
});
