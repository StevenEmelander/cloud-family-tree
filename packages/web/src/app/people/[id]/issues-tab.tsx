'use client';

import type { Entry } from '@cloud-family-tree/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatRelativeDate } from '@/lib/date-utils';
import { getErrorMessage } from '@/lib/errors';
import styles from './page.module.css';

export default function IssuesTab({ personId }: { personId: string }) {
  const { user } = useAuth();
  const isEditor = user?.role === 'editors' || user?.role === 'admins';

  const [issues, setIssues] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listEntries(personId, 'issue');
      setIssues(data.items);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load issues'));
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  async function handleSubmit() {
    const content = newContent.trim();
    if (!content) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.createEntry(personId, content, 'issue');
      setNewContent('');
      setShowForm(false);
      await loadIssues();
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'Failed to report issue'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve(entryId: string) {
    if (deletingId) return;
    const issue = issues.find((e) => e.entryId === entryId);
    if (!issue) return;
    setDeletingId(entryId);
    try {
      await api.deleteEntry(entryId, issue.personId);
      setConfirmingDeleteId(null);
      await loadIssues();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to resolve issue'));
    } finally {
      setDeletingId(null);
    }
  }

  function canResolve(issue: Entry): boolean {
    if (!user) return false;
    return issue.authorId === user.userId || isEditor;
  }

  return (
    <div>
      {error && <p className={styles.error}>{error}</p>}

      {user && !showForm && (
        <button type="button" className={styles.addEntryBtn} onClick={() => setShowForm(true)}>
          Report an Issue
        </button>
      )}

      {user && showForm && (
        <div className={styles.entryForm}>
          <p
            style={{ fontSize: '0.813rem', color: 'var(--color-fg-muted)', marginBottom: '0.5rem' }}
          >
            Report data errors, missing info, or corrections needed for this person.
          </p>
          <textarea
            className={styles.entryTextarea}
            rows={3}
            maxLength={2000}
            placeholder="Describe the issue..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            disabled={submitting}
          />
          {submitError && <p className={styles.fieldError}>{submitError}</p>}
          <div className={styles.entryFormActions}>
            <button
              type="button"
              className={styles.btnSave}
              onClick={handleSubmit}
              disabled={submitting || !newContent.trim()}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={() => {
                setShowForm(false);
                setNewContent('');
              }}
            >
              Cancel
            </button>
            <span className={styles.entryCharCount}>{newContent.length}/2000</span>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading issues...</p>
      ) : issues.length === 0 ? (
        <p className={styles.emptyRel}>No issues reported for this person.</p>
      ) : (
        <div className={styles.entryList}>
          {issues.map((issue) => (
            <div key={issue.entryId} className={styles.entryCard}>
              <div className={styles.entryHeader}>
                <span className={styles.entryAuthor}>{issue.authorName}</span>
                <span className={styles.entryDate}>{formatRelativeDate(issue.createdAt)}</span>
                {canResolve(issue) && (
                  <div className={styles.entryActions}>
                    {confirmingDeleteId === issue.entryId ? (
                      <span className={styles.confirmDelete}>
                        <span className={styles.confirmText}>Resolve?</span>
                        <button
                          type="button"
                          className={styles.btnConfirmYes}
                          onClick={() => handleResolve(issue.entryId)}
                          disabled={!!deletingId}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          className={styles.btnConfirmNo}
                          onClick={() => setConfirmingDeleteId(null)}
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.btnEditRel}
                        onClick={() => setConfirmingDeleteId(issue.entryId)}
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className={styles.entryContent}>{issue.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
