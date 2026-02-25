'use client';

import type { Entry } from '@cloud-family-tree/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatRelativeDate } from '@/lib/date-utils';
import styles from './page.module.css';

interface PersonIssueGroup {
  personId: string;
  name: string;
  count: number;
}

export default function ReviewIssuesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === 'admins';
  const isEditor = user?.role === 'editors' || isAdmin;

  const [bugs, setBugs] = useState<Entry[]>([]);
  const [issueGroups, setIssueGroups] = useState<PersonIssueGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isEditor)) {
      router.push('/');
    }
  }, [user, authLoading, isEditor, router]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bugData, issueData] = await Promise.all([
        api.listAllEntries('bug'),
        api.listAllEntries('issue'),
      ]);
      setBugs(bugData.items);

      // Group issues by person and fetch names
      const byPerson = new Map<string, number>();
      for (const issue of issueData.items) {
        byPerson.set(issue.personId, (byPerson.get(issue.personId) || 0) + 1);
      }
      const groups: PersonIssueGroup[] = await Promise.all(
        Array.from(byPerson.entries()).map(async ([personId, count]) => {
          try {
            const person = await api.getPerson(personId);
            const name = `${person.firstName}${person.middleName ? ` ${person.middleName}` : ''} ${person.lastName}`;
            return { personId: personId, name, count };
          } catch {
            return { personId: personId, name: 'Unknown Person', count };
          }
        }),
      );
      groups.sort((a, b) => a.name.localeCompare(b.name));
      setIssueGroups(groups);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && isEditor) loadData();
  }, [user, isEditor, loadData]);

  async function handleResolve(entry: Entry) {
    if (resolvingId) return;
    setResolvingId(entry.entryId);
    try {
      await api.deleteEntry(entry.entryId, entry.personId);
      setConfirmingId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve');
    } finally {
      setResolvingId(null);
    }
  }

  if (authLoading || !user || !isEditor) return null;

  const totalIssueCount = issueGroups.reduce((sum, g) => sum + g.count, 0);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Review Issues</h1>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Bug Reports ({bugs.length})</h2>
            {bugs.length === 0 ? (
              <p className={styles.empty}>No bug reports.</p>
            ) : (
              <div className={styles.list}>
                {bugs.map((bug) => (
                  <div key={bug.entryId} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <span className={styles.author}>{bug.authorName}</span>
                      <span className={styles.date}>{formatRelativeDate(bug.createdAt)}</span>
                      {isAdmin && (
                        <div className={styles.actions}>
                          {confirmingId === bug.entryId ? (
                            <span className={styles.confirm}>
                              <span>Resolve?</span>
                              <button
                                type="button"
                                className={styles.btnYes}
                                onClick={() => handleResolve(bug)}
                                disabled={!!resolvingId}
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                className={styles.btnNo}
                                onClick={() => setConfirmingId(null)}
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={styles.btnResolve}
                              onClick={() => setConfirmingId(bug.entryId)}
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <p className={styles.content}>{bug.content}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Data Issues ({totalIssueCount})</h2>
            {issueGroups.length === 0 ? (
              <p className={styles.empty}>No data issues.</p>
            ) : (
              <div className={styles.list}>
                {issueGroups.map((group) => (
                  <div key={group.personId} className={styles.card}>
                    <Link
                      href={`/people/${group.personId}?tab=issues`}
                      className={styles.personLink}
                    >
                      {group.name}
                    </Link>
                    {group.count > 1 && <span className={styles.date}>{group.count} issues</span>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
