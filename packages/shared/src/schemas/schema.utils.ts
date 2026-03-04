import { z } from 'zod';
import { flexDatePattern, isValidFlexDate } from '../utils/date.utils';

/** Schema for a flexible date field: accepts YYYY, YYYY-MM, or YYYY-MM-DD. */
export const isoDate = z
  .string()
  .regex(flexDatePattern, 'Must be YYYY, YYYY-MM, or YYYY-MM-DD')
  .refine(isValidFlexDate, 'Invalid date');

/** Schema for a clearable date field: accepts a valid date or empty string (clears the field). */
export const clearableDate = z
  .union([isoDate, z.literal('')])
  .transform((v) => (v === '' ? undefined : v));

/** Schema factory for a clearable string field: accepts a trimmed string up to `max` or empty string (clears the field). */
export const clearableString = (max: number) =>
  z.union([z.string().max(max).trim(), z.literal('')]).transform((v) => (v === '' ? undefined : v));
