import type { AuthenticatedUser, UserRole } from '@cloud-family-tree/shared';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { ForbiddenError, UnauthorizedError } from './error-handler';

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.COGNITO_USER_POOL_ID!,
      tokenUse: 'id',
      clientId: process.env.COGNITO_CLIENT_ID!,
    });
  }
  return verifier;
}

export async function authenticate(event: APIGatewayProxyEvent): Promise<AuthenticatedUser> {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader) {
    throw new UnauthorizedError('Missing Authorization header');
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  try {
    const payload = await getVerifier().verify(token);
    const groups = ((payload as Record<string, unknown>)['cognito:groups'] as string[]) || [];
    const claims = payload as Record<string, unknown>;

    // Pick highest-priority role (admins > editors > visitors)
    const rolePriority: Record<string, number> = { admins: 3, editors: 2, visitors: 1 };
    const role = groups.sort((a, b) => (rolePriority[b] ?? 0) - (rolePriority[a] ?? 0))[0] as
      | UserRole
      | undefined;

    return {
      userId: payload.sub,
      email: claims.email as string,
      name: (claims.name as string) || (claims.email as string),
      role: role || null,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export type RequiredAccess = 'read' | 'authenticated' | 'write' | 'admin';

export async function authorize(
  event: APIGatewayProxyEvent,
  requiredAccess: RequiredAccess,
): Promise<AuthenticatedUser | null> {
  const requireAuthForRead = process.env.REQUIRE_AUTH_FOR_READ === 'true';

  // Read access: may be public
  if (requiredAccess === 'read' && !requireAuthForRead) {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader) {
      return null; // Public access allowed
    }
    const user = await authenticate(event);
    return user;
  }

  const user = await authenticate(event);

  if (requiredAccess === 'write') {
    if (user.role !== 'editors' && user.role !== 'admins') {
      throw new ForbiddenError('Editor or Admin role required');
    }
  }

  if (requiredAccess === 'admin') {
    if (user.role !== 'admins') {
      throw new ForbiddenError('Admin role required');
    }
  }

  return user;
}
