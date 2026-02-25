'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthUser } from './auth';
import {
  changePassword as authChangePassword,
  confirmSignUp as authConfirmSignUp,
  signOut as authSignOut,
  signUp as authSignUp,
  completeNewPassword,
  getCurrentUser,
  signIn,
} from './auth';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  updateUser: (patch: Partial<AuthUser>) => void;
  signIn: (email: string, password: string) => Promise<{ newPasswordRequired: boolean }>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  completeNewPassword: (newPassword: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  const handleSignIn = useCallback(async (email: string, password: string) => {
    const result = await signIn(email, password);
    if (!result.newPasswordRequired) {
      setUser(result.user);
    }
    return { newPasswordRequired: result.newPasswordRequired };
  }, []);

  const handleSignUp = useCallback(async (email: string, password: string, name: string) => {
    await authSignUp(email, password, name);
  }, []);

  const handleConfirmSignUp = useCallback(async (email: string, code: string) => {
    await authConfirmSignUp(email, code);
  }, []);

  const handleCompleteNewPassword = useCallback(async (newPassword: string) => {
    const u = await completeNewPassword(newPassword);
    setUser(u);
  }, []);

  const handleChangePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    await authChangePassword(oldPassword, newPassword);
  }, []);

  const handleUpdateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleSignOut = useCallback(() => {
    authSignOut().catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        updateUser: handleUpdateUser,
        signIn: handleSignIn,
        signUp: handleSignUp,
        confirmSignUp: handleConfirmSignUp,
        completeNewPassword: handleCompleteNewPassword,
        changePassword: handleChangePassword,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
