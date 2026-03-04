import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../src/middleware/error-handler';
import { errorResponse, successResponse } from '../../src/middleware/response';

describe('Response middleware', () => {
  describe('successResponse', () => {
    it('wraps data in { data } envelope', () => {
      const result = successResponse(200, { name: 'John' });
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toEqual({ name: 'John' });
    });

    it('includes CORS headers', () => {
      const result = successResponse(200, null);
      expect(result.headers?.['Access-Control-Allow-Origin']).toBe('https://localhost:3000');
      expect(result.headers?.['Access-Control-Allow-Headers']).toBe('Content-Type,Authorization');
      expect(result.headers?.['Access-Control-Allow-Methods']).toBe('GET,POST,PUT,DELETE,OPTIONS');
      expect(result.headers?.['Content-Type']).toBe('application/json');
    });

    it('handles 201 status code', () => {
      const result = successResponse(201, { id: '123' });
      expect(result.statusCode).toBe(201);
    });

    it('handles null data', () => {
      const result = successResponse(204, null);
      expect(result.statusCode).toBe(204);
      const body = JSON.parse(result.body);
      expect(body.data).toBeNull();
    });

    it('handles array data', () => {
      const result = successResponse(200, [1, 2, 3]);
      const body = JSON.parse(result.body);
      expect(body.data).toEqual([1, 2, 3]);
    });
  });

  describe('errorResponse', () => {
    it('returns 400 for ValidationError with errors array', () => {
      const error = new ValidationError(['field is required', 'invalid format']);
      const result = errorResponse(error);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Validation failed');
      expect(body.errors).toEqual(['field is required', 'invalid format']);
    });

    it('returns correct status for AppError', () => {
      const error = new NotFoundError('Person', '123');
      const result = errorResponse(error);
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('not found');
    });

    it('returns 500 for unknown errors', () => {
      const result = errorResponse(new Error('something broke'));
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Internal server error');
    });

    it('returns 500 for non-Error objects', () => {
      const result = errorResponse('string error');
      expect(result.statusCode).toBe(500);
    });

    it('includes CORS headers on error responses', () => {
      const result = errorResponse(new Error('test'));
      expect(result.headers?.['Access-Control-Allow-Origin']).toBe('https://localhost:3000');
    });
  });
});
