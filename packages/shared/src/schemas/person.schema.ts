import { z } from 'zod';
import { DateQualifier, Gender } from '../types/person';
import { AlternateNameType } from '../types/source';
import { flexDatePattern, isValidFlexDate } from '../utils/date.utils';
import { clearableDate, clearableString } from './schema.utils';

const isoDate = z
  .string()
  .regex(flexDatePattern, 'Must be YYYY, YYYY-MM, or YYYY-MM-DD')
  .refine(isValidFlexDate, 'Invalid date');

const alternateNameSchema = z.object({
  type: z.nativeEnum(AlternateNameType),
  firstName: z.string().max(100).trim().optional(),
  middleName: z.string().max(100).trim().optional(),
  lastName: z.string().max(100).trim().optional(),
  suffix: z.string().max(50).trim().optional(),
  prefix: z.string().max(50).trim().optional(),
});

const personEventSchema = z.object({
  type: z.string().min(1).max(50).trim(),
  date: isoDate.optional(),
  dateQualifier: z.nativeEnum(DateQualifier).optional(),
  place: z.string().max(200).trim().optional(),
  detail: z.string().max(1000).trim().optional(),
  artifactId: z.string().uuid().optional(),
});

const citationSchema = z.object({
  sourceId: z.string().min(1),
  eventType: z.string().max(50).trim().optional(),
  page: z.string().max(500).trim().optional(),
  detail: z.string().max(1000).trim().optional(),
});

export const createPersonSchema = z
  .object({
    firstName: z.string().min(1).max(100).trim(),
    middleName: z.string().max(100).trim().optional(),
    lastName: z.string().min(1).max(100).trim(),
    birthDate: isoDate.optional(),
    birthDateQualifier: z.nativeEnum(DateQualifier).optional(),
    birthPlace: z.string().max(200).trim().optional(),
    deathDate: isoDate.optional(),
    deathDateQualifier: z.nativeEnum(DateQualifier).optional(),
    deathPlace: z.string().max(200).trim().optional(),
    burialPlace: z.string().max(200).trim().optional(),
    gender: z.nativeEnum(Gender),
    biography: z.string().max(5000).trim().optional(),
    suffix: z.string().max(50).trim().optional(),
    prefix: z.string().max(50).trim().optional(),
    nickname: z.string().max(100).trim().optional(),
    alternateNames: z.array(alternateNameSchema).max(20).optional(),
    events: z.array(personEventSchema).max(100).optional(),
    citations: z.array(citationSchema).max(100).optional(),
  })
  .refine(
    (data) => {
      if (data.birthDate && data.deathDate) {
        return data.deathDate >= data.birthDate;
      }
      return true;
    },
    { message: 'Death date must not be before birth date', path: ['deathDate'] },
  );

export const updatePersonSchema = z
  .object({
    firstName: z.string().min(1).max(100).trim().optional(),
    middleName: clearableString(100).optional(),
    lastName: z.string().min(1).max(100).trim().optional(),
    birthDate: clearableDate.optional(),
    birthDateQualifier: z
      .union([z.nativeEnum(DateQualifier), z.literal('')])
      .transform((v) => (v === '' ? undefined : v))
      .optional(),
    birthPlace: clearableString(200).optional(),
    deathDate: clearableDate.optional(),
    deathDateQualifier: z
      .union([z.nativeEnum(DateQualifier), z.literal('')])
      .transform((v) => (v === '' ? undefined : v))
      .optional(),
    deathPlace: clearableString(200).optional(),
    burialPlace: clearableString(200).optional(),
    gender: z.nativeEnum(Gender).optional(),
    biography: clearableString(5000).optional(),
    suffix: clearableString(50).optional(),
    prefix: clearableString(50).optional(),
    nickname: clearableString(100).optional(),
    alternateNames: z.array(alternateNameSchema).max(20).optional(),
    events: z.array(personEventSchema).max(100).optional(),
    citations: z.array(citationSchema).max(100).optional(),
    profilePhotoS3Key: z.string().max(500).optional(),
  })
  .refine(
    (data) => {
      if (data.birthDate && data.deathDate) {
        return data.deathDate >= data.birthDate;
      }
      return true;
    },
    { message: 'Death date must not be before birth date', path: ['deathDate'] },
  );

export type CreatePersonSchemaInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonSchemaInput = z.infer<typeof updatePersonSchema>;
