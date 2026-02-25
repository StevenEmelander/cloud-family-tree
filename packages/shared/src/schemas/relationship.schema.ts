import { z } from 'zod';
import { RelationshipType } from '../types/relationship';

// Accepts YYYY, YYYY-MM, or YYYY-MM-DD
const flexDatePattern = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export const relationshipMetadataSchema = z.object({
  marriageDate: z
    .string()
    .regex(flexDatePattern, 'Must be YYYY, YYYY-MM, or YYYY-MM-DD')
    .optional(),
  marriagePlace: z.string().max(200).trim().optional(),
  divorceDate: z.string().regex(flexDatePattern, 'Must be YYYY, YYYY-MM, or YYYY-MM-DD').optional(),
  divorcePlace: z.string().max(200).trim().optional(),
});

export const createRelationshipSchema = z.object({
  relationshipType: z.nativeEnum(RelationshipType),
  person1Id: z.string().uuid(),
  person2Id: z.string().uuid(),
  metadata: relationshipMetadataSchema.optional(),
});

export type CreateRelationshipSchemaInput = z.infer<typeof createRelationshipSchema>;
