// Accepts YYYY, YYYY-MM, or YYYY-MM-DD
export const flexDatePattern = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/** Validates that a flex date string (YYYY, YYYY-MM, or YYYY-MM-DD) represents a real date. */
export function isValidFlexDate(val: string): boolean {
  const parts = val.split('-').map(Number);
  if (parts.length === 1) {
    const year = parts[0] ?? 0;
    return year >= 1 && year <= 9999;
  }
  if (parts.length === 2) {
    const month = parts[1] ?? 0;
    return month >= 1 && month <= 12;
  }
  const [y, m, d] = parts;
  const yVal = y ?? 0;
  const mVal = m ?? 0;
  const dVal = d ?? 0;
  const date = new Date(yVal, mVal - 1, dVal);
  return date.getFullYear() === yVal && date.getMonth() === mVal - 1 && date.getDate() === dVal;
}

export function isoNow(): string {
  return new Date().toISOString();
}
