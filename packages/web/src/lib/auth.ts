import type {
  CognitoUser as CognitoUserType,
  CognitoUserPool as CognitoUserPoolType,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

let _pool: CognitoUserPoolType | null = null;

async function getPool(): Promise<CognitoUserPoolType> {
  if (_pool) return _pool;
  const { CognitoUserPool } = await import('amazon-cognito-identity-js');
  _pool = new CognitoUserPool({
    UserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? '',
    ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? '',
  });
  return _pool;
}

// Module-scoped state for the new-password challenge flow.
// Stored here (not on window) so the CognitoUser survives between
// signIn() and completeNewPassword() calls without fragile casts.
let pendingCognitoUser: CognitoUserType | null = null;

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: string | null;
  editorRequested: boolean;
}

function parseSession(session: CognitoUserSession): AuthUser {
  const payload = session.getIdToken().decodePayload();
  const groups: string[] = payload['cognito:groups'] ?? [];
  const editorReq = payload['custom:editorRequested'] as string | undefined;
  return {
    userId: payload.sub ?? '',
    email: payload.email ?? '',
    name: payload.name ?? payload.email ?? '',
    role: groups[0] || null,
    editorRequested: !!editorReq && editorReq.length > 0,
  };
}

export async function getCurrentSession(): Promise<CognitoUserSession | null> {
  const pool = await getPool();
  return new Promise((resolve) => {
    const user = pool.getCurrentUser();
    if (!user) return resolve(null);
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) return resolve(null);
      resolve(session);
    });
  });
}

export function getCurrentUser(): Promise<AuthUser | null> {
  return getCurrentSession().then((session) => (session ? parseSession(session) : null));
}

export function getIdToken(): Promise<string | null> {
  return getCurrentSession().then((session) => session?.getIdToken().getJwtToken() ?? null);
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ user: AuthUser; newPasswordRequired: boolean }> {
  const [pool, { CognitoUser, AuthenticationDetails }] = await Promise.all([
    getPool(),
    import('amazon-cognito-identity-js'),
  ]);

  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    cognitoUser.authenticateUser(authDetails, {
      onSuccess(session) {
        resolve({ user: parseSession(session), newPasswordRequired: false });
      },
      onFailure(err) {
        reject(err);
      },
      newPasswordRequired() {
        pendingCognitoUser = cognitoUser;
        resolve({
          user: { userId: '', email, name: email, role: null, editorRequested: false },
          newPasswordRequired: true,
        });
      },
    });
  });
}

export async function signUp(email: string, password: string, name: string): Promise<void> {
  const [pool, { CognitoUserAttribute }] = await Promise.all([
    getPool(),
    import('amazon-cognito-identity-js'),
  ]);

  return new Promise((resolve, reject) => {
    const attributes = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'name', Value: name }),
    ];

    pool.signUp(email, password, attributes, [], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  const [pool, { CognitoUser }] = await Promise.all([
    getPool(),
    import('amazon-cognito-identity-js'),
  ]);

  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    cognitoUser.confirmRegistration(code, true, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function completeNewPassword(newPassword: string): Promise<AuthUser> {
  return new Promise((resolve, reject) => {
    if (!pendingCognitoUser) return reject(new Error('No pending password challenge'));

    pendingCognitoUser.completeNewPasswordChallenge(
      newPassword,
      {},
      {
        onSuccess(session) {
          pendingCognitoUser = null;
          resolve(parseSession(session));
        },
        onFailure(err) {
          reject(err);
        },
      },
    );
  });
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const pool = await getPool();
  return new Promise((resolve, reject) => {
    const user = pool.getCurrentUser();
    if (!user) return reject(new Error('Not signed in'));
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) return reject(new Error('Session expired'));
      user.changePassword(oldPassword, newPassword, (changeErr) => {
        if (changeErr) return reject(changeErr);
        resolve();
      });
    });
  });
}

export async function signOut(): Promise<void> {
  const pool = await getPool();
  const user = pool.getCurrentUser();
  if (user) user.signOut();
}
