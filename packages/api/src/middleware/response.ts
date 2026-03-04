import type { APIGatewayProxyResult } from 'aws-lambda';
import { AppError, ValidationError } from './error-handler';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.FRONTEND_DOMAIN || 'https://localhost:3000',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export function successResponse(statusCode: number, data: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ data }),
  };
}

export function errorResponse(error: unknown): APIGatewayProxyResult {
  if (error instanceof ValidationError) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message, errors: error.errors }),
    };
  }

  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }

  console.error('Unhandled error:', error instanceof Error ? error.message : 'Unknown error');
  return {
    statusCode: 500,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Internal server error' }),
  };
}
