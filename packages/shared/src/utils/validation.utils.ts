import type { ZodSchema } from 'zod';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

export function validate<T>(schema: ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}
