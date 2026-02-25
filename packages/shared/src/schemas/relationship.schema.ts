import { z } from 'zod';
import { RelationshipType } from '../types/relationship';
import { flexDatePattern, isValidFlexDate } from '../utils/date.utils';

const flexDate = z
  .string()
  .regex(flexDatePattern, 'Must be YYYY, YYYY-MM, or YYYY-MM-DD')
  .refine(isValidFlexDate, 'Invalid date');

export const relationshipMetadataSchema = z.object({
  marriageDate: flexDate.optional(),
  marriagePlace: z.string().max(200).trim().optional(),
  divorceDate: flexDate.optional(),
  divorcePlace: z.string().max(200).trim().optional(),
});

export const createRelationshipSchema = z.object({
  relationshipType: z.nativeEnum(RelationshipType),
  person1Id: z.string().uuid(),
  person2Id: z.string().uuid(),
  metadata: relationshipMetadataSchema.optional(),
});

export type CreateRelationshipSchemaInput = z.infer<typeof createRelationshipSchema>;
