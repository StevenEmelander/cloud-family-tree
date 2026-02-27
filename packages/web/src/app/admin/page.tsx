'use client';

import type { AdminUserListItem, GedcomImportResult } from '@cloud-family-tree/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatRelativeDate } from '@/lib/date-utils';
import { getErrorMessage } from '@/lib/errors';
import { siteConfig } from '@/lib/site-config';
import styles from './page.module.css';

const USERS_PER_PAGE = 20;

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // GEDCOM state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<GedcomImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingGedzip, setExportingGedzip] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadUsers = useCallback(async () => {
    try {
      setError(null);
      const data = await api.listUsers();
      setUsers(data.users);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load users'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'admins') {
      router.push('/');
      return;
    }
    loadUsers();
  }, [user, authLoading, router, loadUsers]);

  // Pending editor requests (shown in separate section)
  const pendingApprovals = users.filter((u) => u.editorRequested && u.role === 'visitor');

  // Sort by role (visitors, editors, admins), then by name
  const sortedUsers = [...users].sort((a, b) => {
    const rolePriority: Record<string, number> = { visitor: 0, editor: 1, admin: 2 };
    const roleDiff = (rolePriority[a.role] ?? 0) - (rolePriority[b.role] ?? 0);
    if (roleDiff !== 0) return roleDiff;
    return (a.name || a.email).localeCompare(b.name || b.email);
  });

  // Pagination
  const totalPages = Math.ceil(sortedUsers.length / USERS_PER_PAGE);
  const pagedUsers = sortedUsers.slice(page * USERS_PER_PAGE, (page + 1) * USERS_PER_PAGE);

  async function handleApprove(username: string) {
    try {
      await api.approveUser(username);
      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to approve user'));
    }
  }

  async function handleDelete(username: string) {
    if (!confirm('Permanently delete this user?')) return;
    try {
      await api.deleteUser(username);
      await loadUsers();
      // Adjust page if we deleted the last item on the current page
      if (pagedUsers.length === 1 && page > 0) setPage(page - 1);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete user'));
    }
  }

  async function handleRoleChange(username: string, role: 'admin' | 'editor' | 'visitor') {
    try {
      await api.setUserRole(username, role);
      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to change role'));
    }
  }

  function getRoleSelectClass(role: AdminUserListItem['role']) {
    switch (role) {
      case 'admin':
        return styles.roleSelectAdmin;
      case 'editor':
        return styles.roleSelectEditor;
      case 'visitor':
        return styles.roleSelectVisitor;
      default:
        return styles.roleSelectVisitor;
    }
  }

  // --- GEDCOM handlers ---

  function handleFileSelect(file: File) {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.ged') && !name.endsWith('.gedcom') && !name.endsWith('.gdz')) {
      setImportError('Please select a valid GEDCOM file (.ged, .gedcom, or .gdz)');
      return;
    }
    setSelectedFile(file);
    setImportResult(null);
    setImportError(null);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  async function handleImport() {
    if (!selectedFile) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      let result: GedcomImportResult;
      if (selectedFile.name.toLowerCase().endsWith('.gdz')) {
        // GEDZIP: upload to S3 via presigned URL, then trigger import
        const { s3Key, uploadUrl } = await api.getGedzipUploadUrl();
        const fileBytes = await selectedFile.arrayBuffer();
        await fetch(uploadUrl, {
          method: 'PUT',
          body: fileBytes,
          headers: { 'Content-Type': 'application/zip' },
        });
        result = await api.importGedzip(s3Key);
      } else {
        const content = await selectedFile.text();
        result = await api.importGedcom(content);
      }
      setImportResult(result);
      setSelectedFile(null);
    } catch (err) {
      setImportError(getErrorMessage(err, 'Import failed'));
    } finally {
      setImporting(false);
    }
  }

  function clearFileSelection() {
    setSelectedFile(null);
    setImportError(null);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const result = await api.exportGedcom();
      const blob = new Blob([result.gedcom], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${siteConfig.familyName.toLowerCase()}-family-${new Date().toISOString().slice(0, 10)}.ged`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setImportError(getErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  }

  async function handleExportGedzip() {
    setExportingGedzip(true);
    try {
      const result = await api.exportGedzip();
      const a = document.createElement('a');
      a.href = result.downloadUrl;
      a.download = `${siteConfig.familyName.toLowerCase()}-family-${new Date().toISOString().slice(0, 10)}.gdz`;
      a.click();
    } catch (err) {
      setImportError(getErrorMessage(err, 'GEDZIP export failed'));
    } finally {
      setExportingGedzip(false);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (authLoading || loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Admin</h1>
        <p className={styles.loading}>Loading...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Admin</h1>

      {error && <p className={styles.error}>{error}</p>}

      {/* Pending Editor Requests */}
      {pendingApprovals.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>Editor Access Requests</h2>
          {pendingApprovals.map((u) => (
            <div key={u.userId} className={styles.approvalCard}>
              <div className={styles.approvalInfo}>
                <div className={styles.approvalName}>{u.name || u.email}</div>
                <div className={styles.approvalMeta}>
                  {u.name ? `${u.email} · ` : ''}Requested editor access{' '}
                  {/* biome-ignore lint/style/noNonNullAssertion: editorRequested is guaranteed non-null inside pendingApprovals filter */}
                  {formatRelativeDate(u.editorRequested!)}
                </div>
              </div>
              <div className={styles.approvalActions}>
                <button
                  type="button"
                  className={styles.btnApprove}
                  onClick={() => handleApprove(u.userId)}
                  title="Grant editor access"
                >
                  Grant Editor
                </button>
                <button
                  type="button"
                  className={styles.btnDeny}
                  onClick={() => handleDelete(u.userId)}
                  title="Deny request and delete user"
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Users */}
      <h2 className={styles.sectionTitle}>Users</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {pagedUsers.map((u) => (
            <tr key={u.userId}>
              <td>{u.name || '-'}</td>
              <td>{u.email}</td>
              <td>
                <div className={styles.actions}>
                  <select
                    className={`${styles.roleSelect} ${getRoleSelectClass(u.role)}`}
                    value={u.role}
                    disabled={u.email === user?.email}
                    onChange={(e) =>
                      handleRoleChange(u.userId, e.target.value as 'admin' | 'editor' | 'visitor')
                    }
                  >
                    <option value="visitor">Visitor</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                  {u.email === user?.email && <span className={styles.selfLabel}>(You)</span>}
                  <button
                    type="button"
                    className={styles.btnDelete}
                    disabled={u.email === user?.email}
                    onClick={() => handleDelete(u.userId)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                No users found
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span className={styles.pageInfo}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* GEDCOM Data Management */}
      <h2 className={styles.sectionTitle}>Family Tree Data</h2>
      <div className={styles.gedcomSection}>
        {/* Import Card */}
        <div className={styles.gedcomCard}>
          <h3 className={styles.gedcomLabel}>Import GEDCOM</h3>
          <p className={styles.gedcomDesc}>
            Upload a GEDCOM (.ged) or GEDZIP (.gdz) file to add people, relationships, sources, and
            photos to the tree. Existing data will not be replaced.
          </p>

          {!selectedFile && !importing && (
            // biome-ignore lint/a11y/useSemanticElements: div with role="button" is needed here because element also serves as a drag-and-drop target
            <div
              className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              <div className={styles.dropZoneIcon}>&#x1F4C1;</div>
              <div className={styles.dropZoneText}>
                Drag and drop a .ged or .gdz file here, or click to browse
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ged,.gedcom,.gdz"
                onChange={handleFileInputChange}
                hidden
              />
            </div>
          )}

          {selectedFile && !importing && (
            <div className={styles.filePreview}>
              <div className={styles.fileInfo}>
                <span className={styles.fileName}>{selectedFile.name}</span>
                <span className={styles.fileSize}>{formatFileSize(selectedFile.size)}</span>
              </div>
              <div className={styles.fileActions}>
                <button type="button" className={styles.btnImport} onClick={handleImport}>
                  Import File
                </button>
                <button type="button" className={styles.btnCancel} onClick={clearFileSelection}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {importing && (
            <div className={styles.progressContainer}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} />
              </div>
              <p className={styles.progressText}>
                Importing {selectedFile?.name ?? 'file'}... This may take a moment for large files.
              </p>
            </div>
          )}
        </div>

        {/* Export Card */}
        <div className={styles.gedcomCard}>
          <h3 className={styles.gedcomLabel}>Export Family Tree</h3>
          <p className={styles.gedcomDesc}>
            Download all family tree data for backup or use in other genealogy software.
          </p>
          <div className={styles.exportButtons}>
            <button
              type="button"
              className={styles.btnExport}
              onClick={handleExport}
              disabled={exporting || exportingGedzip}
            >
              {exporting ? 'Preparing...' : 'Download GEDCOM'}
            </button>
            <button
              type="button"
              className={styles.btnExport}
              onClick={handleExportGedzip}
              disabled={exporting || exportingGedzip}
            >
              {exportingGedzip ? 'Preparing...' : 'Download GEDZIP'}
            </button>
          </div>
          <p className={styles.exportHint}>
            GEDZIP includes photos and media files. GEDCOM is data only.
          </p>
        </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <div className={styles.resultCard}>
          <h4 className={styles.resultTitle}>Import Complete</h4>
          <div className={styles.resultStats}>
            <div className={styles.resultStat}>
              <span className={styles.resultNumber}>{importResult.peopleAdded}</span>
              <span className={styles.resultLabel}>People added</span>
            </div>
            {importResult.peopleSkipped > 0 && (
              <div className={styles.resultStat}>
                <span className={styles.resultNumber}>{importResult.peopleSkipped}</span>
                <span className={styles.resultLabel}>Already existed</span>
              </div>
            )}
            {importResult.peopleUpdated > 0 && (
              <div className={styles.resultStat}>
                <span className={styles.resultNumber}>{importResult.peopleUpdated}</span>
                <span className={styles.resultLabel}>Notes updated</span>
              </div>
            )}
            <div className={styles.resultStat}>
              <span className={styles.resultNumber}>{importResult.relationshipsAdded}</span>
              <span className={styles.resultLabel}>Relationships added</span>
            </div>
            {importResult.relationshipsSkipped > 0 && (
              <div className={styles.resultStat}>
                <span className={styles.resultNumber}>{importResult.relationshipsSkipped}</span>
                <span className={styles.resultLabel}>Relationships existed</span>
              </div>
            )}
            {importResult.sourcesAdded > 0 && (
              <div className={styles.resultStat}>
                <span className={styles.resultNumber}>{importResult.sourcesAdded}</span>
                <span className={styles.resultLabel}>Sources added</span>
              </div>
            )}
            {importResult.artifactsAdded > 0 && (
              <div className={styles.resultStat}>
                <span className={styles.resultNumber}>{importResult.artifactsAdded}</span>
                <span className={styles.resultLabel}>Photos added</span>
              </div>
            )}
            {importResult.artifactsSkipped > 0 && (
              <div className={styles.resultStat}>
                <span className={styles.resultNumber}>{importResult.artifactsSkipped}</span>
                <span className={styles.resultLabel}>Photos skipped</span>
              </div>
            )}
          </div>
          {importResult.errors.length > 0 && (
            <div className={styles.resultErrors}>
              <p className={styles.resultErrorTitle}>
                {importResult.errors.length} error{importResult.errors.length !== 1 ? 's' : ''}{' '}
                during import:
              </p>
              <ul className={styles.resultErrorList}>
                {importResult.errors.slice(0, 10).map((err) => (
                  <li key={err}>{err}</li>
                ))}
                {importResult.errors.length > 10 && (
                  <li>...and {importResult.errors.length - 10} more</li>
                )}
              </ul>
            </div>
          )}
          {importResult.warnings && importResult.warnings.length > 0 && (
            <div className={styles.resultWarnings}>
              <p className={styles.resultWarningTitle}>
                {importResult.warnings.length} warning
                {importResult.warnings.length !== 1 ? 's' : ''}:
              </p>
              <ul className={styles.resultErrorList}>
                {importResult.warnings.slice(0, 5).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" className={styles.btnDismiss} onClick={() => setImportResult(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Import Error */}
      {importError && (
        <div className={styles.importErrorCard}>
          <p className={styles.importErrorText}>{importError}</p>
          <button type="button" className={styles.btnDismiss} onClick={() => setImportError(null)}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
