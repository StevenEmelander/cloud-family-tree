'use client';

import type { Source } from '@cloud-family-tree/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getErrorMessage } from '@/lib/errors';
import styles from './page.module.css';

export default function SourcesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isEditor = user?.role === 'admins' || user?.role === 'editors';

  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', author: '', url: '', publicationInfo: '', notes: '' });
  const [saving, setSaving] = useState(false);

  // Create state
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', author: '', url: '', publicationInfo: '', notes: '' });

  // Delete state
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const loadSources = useCallback(async () => {
    try {
      setError(null);
      const data = await api.listSources();
      setSources(data.items);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load sources'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isEditor) {
      router.push('/');
      return;
    }
    loadSources();
  }, [user, authLoading, router, isEditor, loadSources]);

  const filtered = search.trim()
    ? sources.filter(
        (s) =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.author?.toLowerCase().includes(search.toLowerCase()) ||
          s.url?.toLowerCase().includes(search.toLowerCase()),
      )
    : sources;

  function startEdit(s: Source) {
    setEditingId(s.sourceId);
    setEditForm({
      title: s.title,
      author: s.author || '',
      url: s.url || '',
      publicationInfo: s.publicationInfo || '',
      notes: s.notes || '',
    });
  }

  async function handleSave() {
    if (!editingId || !editForm.title.trim()) return;
    setSaving(true);
    try {
      await api.updateSource(editingId, {
        title: editForm.title.trim(),
        author: editForm.author.trim() || undefined,
        url: editForm.url.trim() || undefined,
        publicationInfo: editForm.publicationInfo.trim() || undefined,
        notes: editForm.notes.trim() || undefined,
      });
      setSources((prev) =>
        prev.map((s) =>
          s.sourceId === editingId
            ? { ...s, title: editForm.title.trim(), author: editForm.author.trim() || undefined, url: editForm.url.trim() || undefined, publicationInfo: editForm.publicationInfo.trim() || undefined, notes: editForm.notes.trim() || undefined }
            : s,
        ),
      );
      setEditingId(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update source'));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!createForm.title.trim()) return;
    setSaving(true);
    try {
      const created = await api.createSource({
        title: createForm.title.trim(),
        ...(createForm.author.trim() && { author: createForm.author.trim() }),
        ...(createForm.url.trim() && { url: createForm.url.trim() }),
        ...(createForm.publicationInfo.trim() && { publicationInfo: createForm.publicationInfo.trim() }),
        ...(createForm.notes.trim() && { notes: createForm.notes.trim() }),
      });
      setSources((prev) => [...prev, created]);
      setCreating(false);
      setCreateForm({ title: '', author: '', url: '', publicationInfo: '', notes: '' });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create source'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(sourceId: string) {
    try {
      await api.deleteSource(sourceId);
      setSources((prev) => prev.filter((s) => s.sourceId !== sourceId));
      setConfirmingDelete(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete source'));
    }
  }

  if (authLoading || loading) {
    return <div className={styles.container}><p className={styles.loading}>Loading...</p></div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Sources</h1>
        <button type="button" className={styles.btnCreate} onClick={() => setCreating(!creating)}>
          {creating ? 'Cancel' : '+ New Source'}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {creating && (
        <div className={styles.createCard}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Title *</span>
              <input type="text" className={styles.input} value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Author</span>
              <input type="text" className={styles.input} value={createForm.author} onChange={(e) => setCreateForm({ ...createForm, author: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>URL</span>
              <input type="text" className={styles.input} value={createForm.url} onChange={(e) => setCreateForm({ ...createForm, url: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Publisher</span>
              <input type="text" className={styles.input} value={createForm.publicationInfo} onChange={(e) => setCreateForm({ ...createForm, publicationInfo: e.target.value })} />
            </label>
          </div>
          <div className={styles.formActions}>
            <button type="button" className={styles.btnSave} onClick={handleCreate} disabled={saving || !createForm.title.trim()}>
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <input
        type="text"
        className={styles.searchInput}
        placeholder="Search sources..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className={styles.sourceList}>
        {filtered.length === 0 && (
          <p className={styles.empty}>{search ? 'No sources match your search.' : 'No sources yet.'}</p>
        )}
        {filtered.map((s) => (
          <div key={s.sourceId} className={styles.sourceCard}>
            {editingId === s.sourceId ? (
              <div className={styles.editForm}>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.label}>Title</span>
                    <input type="text" className={styles.input} value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Author</span>
                    <input type="text" className={styles.input} value={editForm.author} onChange={(e) => setEditForm({ ...editForm, author: e.target.value })} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>URL</span>
                    <input type="text" className={styles.input} value={editForm.url} onChange={(e) => setEditForm({ ...editForm, url: e.target.value })} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Publisher</span>
                    <input type="text" className={styles.input} value={editForm.publicationInfo} onChange={(e) => setEditForm({ ...editForm, publicationInfo: e.target.value })} />
                  </label>
                </div>
                <label className={styles.field}>
                  <span className={styles.label}>Notes</span>
                  <textarea className={styles.textarea} rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                </label>
                <div className={styles.formActions}>
                  <button type="button" className={styles.btnSave} onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" className={styles.btnCancel} onClick={() => setEditingId(null)} disabled={saving}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.sourceHeader}>
                  <span className={styles.sourceTitle}>{s.title}</span>
                  <div className={styles.sourceActions}>
                    <button type="button" className={styles.btnEdit} onClick={() => startEdit(s)}>Edit</button>
                    {confirmingDelete === s.sourceId ? (
                      <>
                        <button type="button" className={styles.btnDeleteConfirm} onClick={() => handleDelete(s.sourceId)}>Delete</button>
                        <button type="button" className={styles.btnCancel} onClick={() => setConfirmingDelete(null)}>No</button>
                      </>
                    ) : (
                      <button type="button" className={styles.btnDeleteSmall} onClick={() => setConfirmingDelete(s.sourceId)}>Delete</button>
                    )}
                  </div>
                </div>
                <div className={styles.sourceMeta}>
                  {s.author && <span>{s.author}</span>}
                  {s.publicationInfo && <span>{s.publicationInfo}</span>}
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className={styles.sourceUrl}>
                      {s.url}
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <p className={styles.count}>{sources.length} source{sources.length !== 1 ? 's' : ''}</p>
    </div>
  );
}
