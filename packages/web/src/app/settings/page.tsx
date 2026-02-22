'use client';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { displayRole } from '@/lib/site-config';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './page.module.css';

export default function SettingsPage() {
  const { user, loading: authLoading, changePassword, updateUser } = useAuth();
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwStatus, setPwStatus] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [changingPw, setChangingPw] = useState(false);
  const [requestingEditor, setRequestingEditor] = useState(false);
  const [editorRequestStatus, setEditorRequestStatus] = useState<string | null>(null);
  const [editorRequestError, setEditorRequestError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwStatus(null);
    if (newPassword !== confirmPw) {
      setPwError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('Password must be at least 8 characters');
      return;
    }
    setChangingPw(true);
    try {
      await changePassword(oldPassword, newPassword);
      setPwStatus('Password changed successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPw('');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPw(false);
    }
  }

  async function handleRequestEditor() {
    setRequestingEditor(true);
    setEditorRequestError(null);
    setEditorRequestStatus(null);
    try {
      const result = await api.requestEditor();
      updateUser({ editorRequested: true });
      setEditorRequestStatus(result.message);
    } catch (err) {
      setEditorRequestError(err instanceof Error ? err.message : 'Failed to request editor access');
    } finally {
      setRequestingEditor(false);
    }
  }

  const isVisitor = user?.role === 'visitors';

  if (authLoading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Account Settings</h1>
        <p className={styles.loading}>Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Account Settings</h1>

      <div className={styles.card}>
        <p className={styles.email}>
          Signed in as <strong>{user.email}</strong>
        </p>
        {user.role && (
          <p className={styles.role}>
            Role: <span className={`${styles.roleBadge} ${user.role === 'admins' ? styles.roleBadgeAdmin : user.role === 'editors' ? styles.roleBadgeEditor : styles.roleBadgeVisitor}`}>{displayRole(user.role)}</span>
          </p>
        )}
      </div>

      {isVisitor && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Request Editor Access</h2>
          <p className={styles.cardDesc}>
            As a visitor, you can browse the family tree and contribute to memorial walls. To add or edit family
            members, relationships, and photos, request editor access below.
          </p>
          {editorRequestStatus || user.editorRequested ? (
            <p className={styles.success}>
              {editorRequestStatus || 'Editor access requested — an administrator will review your request.'}
            </p>
          ) : (
            <>
              {editorRequestError && <p className={styles.error}>{editorRequestError}</p>}
              <button
                type="button"
                className={styles.button}
                onClick={handleRequestEditor}
                disabled={requestingEditor}
              >
                {requestingEditor ? 'Requesting...' : 'Request Editor Access'}
              </button>
            </>
          )}
        </div>
      )}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Change Password</h2>
        <form onSubmit={handleChangePassword} className={styles.form}>
          <input
            type="password"
            placeholder="Current password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className={styles.input}
            required
          />
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={styles.input}
            required
            minLength={8}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            className={styles.input}
            required
            minLength={8}
          />
          {pwError && <p className={styles.error}>{pwError}</p>}
          {pwStatus && <p className={styles.success}>{pwStatus}</p>}
          <button type="submit" className={styles.button} disabled={changingPw}>
            {changingPw ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
