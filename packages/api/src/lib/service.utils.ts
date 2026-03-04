import { isoNow } from '@cloud-family-tree/shared';

/**
 * Build an updates object from validated data, converting cleared optional fields to null
 * so DynamoDB removes them.
 *
 * For each field in `clearableFields`, if the field was present in the raw `input`
 * but the validated value is `undefined` (i.e. the user sent an empty string that
 * the schema transformed to `undefined`), we set it to `null` so the repository
 * issues a REMOVE expression.
 */
export function applyClears(
  input: Record<string, unknown>,
  validated: Record<string, unknown>,
  clearableFields: readonly string[],
): Record<string, unknown> {
  const updates: Record<string, unknown> = { ...validated, updatedAt: isoNow() };
  for (const field of clearableFields) {
    if (field in input && updates[field] === undefined) {
      updates[field] = null;
    }
  }
  return updates;
}
