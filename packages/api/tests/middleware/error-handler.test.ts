import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../src/middleware/error-handler';

describe('Error classes', () => {
  describe('AppError', () => {
    it('creates error with status code and message', () => {
      const error = new AppError(500, 'Something went wrong');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Something went wrong');
      expect(error.name).toBe('AppError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('NotFoundError', () => {
    it('creates 404 error with entity name and id', () => {
      const error = new NotFoundError('Person', 'abc-123');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("Person with id 'abc-123' not found");
      expect(error.name).toBe('NotFoundError');
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('ValidationError', () => {
    it('creates 400 error with validation errors array', () => {
      const errors = ['firstName is required', 'gender is invalid'];
      const error = new ValidationError(errors);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Validation failed');
      expect(error.errors).toEqual(errors);
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('UnauthorizedError', () => {
    it('creates 401 error with default message', () => {
      const error = new UnauthorizedError();
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Unauthorized');
    });

    it('creates 401 error with custom message', () => {
      const error = new UnauthorizedError('Token expired');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Token expired');
    });
  });

  describe('ForbiddenError', () => {
    it('creates 403 error with default message', () => {
      const error = new ForbiddenError();
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Forbidden');
    });

    it('creates 403 error with custom message', () => {
      const error = new ForbiddenError('Admin role required');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Admin role required');
    });
  });

  describe('ConflictError', () => {
    it('creates 409 error', () => {
      const error = new ConflictError('Resource already exists');
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Resource already exists');
      expect(error.name).toBe('ConflictError');
    });
  });
});
