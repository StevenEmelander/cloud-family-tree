import { z } from 'zod';
import { API_CONFIG, ARTIFACT_CONFIG } from '../constants';
import { ArtifactType } from '../types/artifact';

const flexDatePattern = /^\d{4}(-\d{2}(-\d{2})?)?$/;

const PDF_ALLOWED_TYPES = new Set([
  ArtifactType.BIRTH_RECORD,
  ArtifactType.DEATH_RECORD,
  ArtifactType.MARRIAGE_RECORD,
  ArtifactType.DIVORCE_RECORD,
  ArtifactType.CENSUS_RECORD,
  ArtifactType.IMMIGRATION_RECORD,
  ArtifactType.OTHER,
]);

export const createArtifactSchema = z
  .object({
    personId: z.string().uuid(),
    artifactType: z.nativeEnum(ArtifactType).optional().default(ArtifactType.PHOTO),
    fileName: z.string().min(1).max(255),
    fileSize: z.coerce
      .number()
      .int()
      .min(1, 'File appears empty')
      .max(API_CONFIG.MAX_ARTIFACT_FILE_SIZE_MB * 1024 * 1024, 'File too large'),
    contentType: z.string(),
    caption: z.string().max(500).trim().optional(),
    source: z.string().max(200).trim().optional(),
    date: z.string().regex(flexDatePattern, 'Must be YYYY, YYYY-MM, or YYYY-MM-DD').optional(),
    isPrimary: z.boolean().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .refine(
    (data) => {
      const allowed = PDF_ALLOWED_TYPES.has(data.artifactType)
        ? ARTIFACT_CONFIG.ALLOWED_MIME_TYPES
        : ARTIFACT_CONFIG.ALLOWED_IMAGE_MIME_TYPES;
      return allowed.includes(data.contentType as never);
    },
    {
      message: 'Invalid content type for this artifact type',
      path: ['contentType'],
    },
  );

export type CreateArtifactSchemaInput = z.infer<typeof createArtifactSchema>;

export const updateArtifactSchema = z.object({
  caption: z
    .union([z.string().max(500).trim(), z.literal('')])
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  source: z
    .union([z.string().max(200).trim(), z.literal('')])
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  date: z
    .union([
      z.string().regex(flexDatePattern, 'Must be YYYY, YYYY-MM, or YYYY-MM-DD'),
      z.literal(''),
    ])
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  isPrimary: z.boolean().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type UpdateArtifactSchemaInput = z.infer<typeof updateArtifactSchema>;
