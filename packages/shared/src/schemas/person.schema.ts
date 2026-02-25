import { z } from 'zod';
import { DateQualifier, Gender } from '../types/person';

// Accepts YYYY, YYYY-MM, or YYYY-MM-DD
const flexDatePattern = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function isValidFlexDate(val: string): boolean {
  const parts = val.split('-').map(Number);
  if (parts.length === 1) {
    return parts[0]! >= 1 && parts[0]! <= 9999;
  }
  if (parts.length === 2) {
    const [, m] = parts;
    return m! >= 1 && m! <= 12;
  }
  const [y, m, d] = parts;
  const date = new Date(y!, m! - 1, d);
  return date.getFullYear() === y && date.getMonth() === m! - 1 && date.getDate() === d;
}

const isoDate = z
  .string()
  .regex(flexDatePattern, 'Must be YYYY, YYYY-MM, or YYYY-MM-DD')
  .refine(isValidFlexDate, 'Invalid date');

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

// Update schema allows empty strings to clear optional fields
const clearableDate = z
  .union([isoDate, z.literal('')])
  .transform((v) => (v === '' ? undefined : v));
const clearableString = (max: number) =>
  z.union([z.string().max(max).trim(), z.literal('')]).transform((v) => (v === '' ? undefined : v));

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
