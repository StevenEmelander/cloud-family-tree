import { describe, expect, it } from 'vitest';
import { handler } from '../../src/handlers/health';

describe('Health handler', () => {
  it('returns 200 with status ok', async () => {
    const result = await handler();
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.status).toBe('ok');
    expect(body.data.timestamp).toBeDefined();
  });

  it('includes CORS headers', async () => {
    const result = await handler();
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });
});
