import { z } from 'zod';

const entryTypeSchema = z.enum(['wall', 'issue', 'bug']).optional().default('wall');

export const createEntrySchema = z.object({
  personId: z.union([z.string().uuid(), z.literal('SITE')]),
  content: z.string().min(1, 'Content is required').max(2000, 'Max 2000 characters'),
  entryType: entryTypeSchema,
});

export const updateEntrySchema = z.object({
  content: z.string().min(1, 'Content is required').max(2000, 'Max 2000 characters'),
});
