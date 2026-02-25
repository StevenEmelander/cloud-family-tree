'use client';

import type { Entry } from '@cloud-family-tree/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatRelativeDate } from '@/lib/date-utils';
import { getErrorMessage } from '@/lib/errors';
import styles from './page.module.css';

export default function WallTab({ personId }: { personId: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admins';

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New entry
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Toggle for the "Add Entry" form
  const [showForm, setShowForm] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listEntries(personId, 'wall');
      setEntries(data.items);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load entries'));
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  async function handleSubmit() {
    const content = newContent.trim();
    if (!content) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.createEntry(personId, content, 'wall');
      setNewContent('');
      setShowForm(false);
      await loadEntries();
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'Failed to add entry'));
    } finally {
      setSubmitting(false);
    }
  }

  function startEditing(entry: Entry) {
    setEditingId(entry.entryId);
    setEditContent(entry.content);
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    const content = editContent.trim();
    if (!content) return;
    setEditSaving(true);
    try {
      const entry = entries.find((e) => e.entryId === editingId);
      if (entry) {
        await api.updateEntry(editingId, entry.personId, content);
      }
      setEditingId(null);
      await loadEntries();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update entry'));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(entryId: string) {
    if (deletingId) return;
    const entry = entries.find((e) => e.entryId === entryId);
    if (!entry) return;
    setDeletingId(entryId);
    try {
      await api.deleteEntry(entryId, entry.personId);
      setConfirmingDeleteId(null);
      await loadEntries();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete entry'));
    } finally {
      setDeletingId(null);
    }
  }

  function canEdit(entry: Entry): boolean {
    if (!user) return false;
    return entry.authorId === user.userId;
  }

  function canDelete(entry: Entry): boolean {
    if (!user) return false;
    return entry.authorId === user.userId || user.role === 'editors' || isAdmin;
  }

  if (loading) return <p>Loading entries...</p>;

  return (
    <div>
      {error && <p className={styles.error}>{error}</p>}

      {user && !showForm && (
        <button type="button" className={styles.addEntryBtn} onClick={() => setShowForm(true)}>
          Add Entry
        </button>
      )}

      {user && showForm && (
        <div className={styles.entryForm}>
          <textarea
            className={styles.entryTextarea}
            rows={3}
            maxLength={2000}
            placeholder="Write a memorial entry..."
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
              {submitting ? 'Posting...' : 'Post'}
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

      {entries.length === 0 ? (
        <p className={styles.emptyRel}>No entries yet. Be the first to contribute!</p>
      ) : (
        <div className={styles.entryList}>
          {entries.map((entry) => (
            <div key={entry.entryId} className={styles.entryCard}>
              <div className={styles.entryHeader}>
                <span className={styles.entryAuthor}>{entry.authorName}</span>
                <span className={styles.entryDate}>
                  {formatRelativeDate(entry.createdAt)}
                  {entry.updatedAt !== entry.createdAt && ' (edited)'}
                </span>
                {(canEdit(entry) || canDelete(entry)) && editingId !== entry.entryId && (
                  <div className={styles.entryActions}>
                    {canEdit(entry) && (
                      <button
                        type="button"
                        className={styles.btnEditRel}
                        onClick={() => startEditing(entry)}
                      >
                        Edit
                      </button>
                    )}
                    {canDelete(entry) &&
                      (confirmingDeleteId === entry.entryId ? (
                        <span className={styles.confirmDelete}>
                          <span className={styles.confirmText}>Delete?</span>
                          <button
                            type="button"
                            className={styles.btnConfirmYes}
                            onClick={() => handleDelete(entry.entryId)}
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
                          className={styles.btnRemoveRel}
                          onClick={() => setConfirmingDeleteId(entry.entryId)}
                          title="Delete entry"
                        >
                          &times;
                        </button>
                      ))}
                  </div>
                )}
              </div>
              {editingId === entry.entryId ? (
                <div className={styles.entryEditForm}>
                  <textarea
                    className={styles.entryTextarea}
                    rows={3}
                    maxLength={2000}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    disabled={editSaving}
                  />
                  <div className={styles.formActions}>
                    <button
                      type="button"
                      className={styles.btnSave}
                      onClick={handleSaveEdit}
                      disabled={editSaving || !editContent.trim()}
                    >
                      {editSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className={styles.btnCancel}
                      onClick={() => setEditingId(null)}
                      disabled={editSaving}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className={styles.entryContent}>{entry.content}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
