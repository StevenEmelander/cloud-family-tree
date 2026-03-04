import { createHmac } from 'node:crypto';
import { CURSOR_HMAC_SECRET } from '@cloud-family-tree/shared';
import { AppError } from '../middleware/error-handler';

function hmac(data: string): string {
  return createHmac('sha256', CURSOR_HMAC_SECRET).update(data).digest('hex');
}

export function encodeCursor(key: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(key)).toString('base64');
  return `${payload}.${hmac(payload)}`;
}

export function decodeCursor(cursor: string): Record<string, unknown> {
  const dotIndex = cursor.lastIndexOf('.');
  if (dotIndex === -1) {
    throw new AppError(400, 'Invalid cursor');
  }

  const payload = cursor.slice(0, dotIndex);
  const signature = cursor.slice(dotIndex + 1);

  if (hmac(payload) !== signature) {
    throw new AppError(400, 'Invalid cursor');
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64').toString()) as Record<string, unknown>;
  } catch {
    throw new AppError(400, 'Invalid cursor');
  }
}
