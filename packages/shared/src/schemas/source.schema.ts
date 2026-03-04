import { z } from 'zod';
import { clearableString } from './schema.utils';

export const createSourceSchema = z.object({
  title: z.string().min(1).max(500).trim(),
  author: z.string().max(500).trim().optional(),
  publicationInfo: z.string().max(1000).trim().optional(),
  repositoryName: z.string().max(500).trim().optional(),
  url: z.string().max(2000).trim().optional(),
  notes: z.string().max(5000).trim().optional(),
});

export const updateSourceSchema = z.object({
  title: z.string().min(1).max(500).trim().optional(),
  author: clearableString(500).optional(),
  publicationInfo: clearableString(1000).optional(),
  repositoryName: clearableString(500).optional(),
  url: clearableString(2000).optional(),
  notes: clearableString(5000).optional(),
});

export type CreateSourceSchemaInput = z.infer<typeof createSourceSchema>;
export type UpdateSourceSchemaInput = z.infer<typeof updateSourceSchema>;
