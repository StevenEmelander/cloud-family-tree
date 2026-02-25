import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRelationshipSchema } from '../../src/schemas/relationship.schema';
import { RelationshipType } from '../../src/types/relationship';

describe('createRelationshipSchema', () => {
  const validInput = {
    relationshipType: RelationshipType.PARENT_CHILD,
    person1Id: randomUUID(),
    person2Id: randomUUID(),
  };

  it('accepts valid input', () => {
    const result = createRelationshipSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts SPOUSE type with marriage metadata', () => {
    const result = createRelationshipSchema.safeParse({
      relationshipType: RelationshipType.SPOUSE,
      person1Id: randomUUID(),
      person2Id: randomUUID(),
      metadata: {
        marriageDate: '2020-06-15',
        marriagePlace: 'City Hall',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid relationship type', () => {
    const result = createRelationshipSchema.safeParse({
      ...validInput,
      relationshipType: 'COUSIN',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for person1Id', () => {
    const result = createRelationshipSchema.safeParse({ ...validInput, person1Id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for person2Id', () => {
    const result = createRelationshipSchema.safeParse({ ...validInput, person2Id: '123' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid marriage date format in metadata', () => {
    const result = createRelationshipSchema.safeParse({
      ...validInput,
      metadata: { marriageDate: 'June 15, 2020' },
    });
    expect(result.success).toBe(false);
  });
});
