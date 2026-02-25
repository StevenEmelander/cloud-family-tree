'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getErrorMessage } from '@/lib/errors';
import styles from './page.module.css';

export default function ReportBugPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createEntry('SITE', content.trim(), 'bug');
      setSuccess(true);
      setContent('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to submit bug report'));
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !user) return null;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Report a Bug</h1>

      {success ? (
        <div className={styles.successMessage}>
          <p>Thank you! Your bug report has been submitted.</p>
          <button type="button" onClick={() => setSuccess(false)} className={styles.btn}>
            Report Another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={styles.form}>
          <p className={styles.guidance}>
            Please include: steps to reproduce, what you expected, what happened instead, and any
            error messages you saw.
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Describe the bug..."
            className={styles.textarea}
            maxLength={2000}
            rows={6}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.btn} disabled={submitting || !content.trim()}>
            {submitting ? 'Submitting...' : 'Submit Bug Report'}
          </button>
        </form>
      )}
    </div>
  );
}
