'use client';

import type { Person } from '@cloud-family-tree/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { formatLifespan } from '@/lib/date-utils';
import { getErrorMessage } from '@/lib/errors';
import { siteConfig } from '@/lib/site-config';
import styles from './page.module.css';

const PAGE_SIZE = 10;

function HomePageContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';
  const didAutoSearch = useRef(false);

  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [hasSearched, setHasSearched] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  // Stack of cursors for previous pages. Index 0 = page 1 cursor (undefined),
  // index 1 = page 2 cursor, etc. Current page = cursorStack.length.
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);

  const loadPeople = useCallback(async (searchTerm?: string, cursor?: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listPeople({
        search: searchTerm || undefined,
        limit: PAGE_SIZE,
        cursor,
      });
      setPeople(data.items);
      setNextCursor(data.lastEvaluatedKey);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load people'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialSearch && !didAutoSearch.current) {
      didAutoSearch.current = true;
      setHasSearched(true);
      loadPeople(initialSearch);
    }
  }, [initialSearch, loadPeople]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setHasSearched(true);
    setCursorStack([undefined]);
    setNextCursor(undefined);
    setTimeout(() => window.scrollTo(0, 0), 50);
    loadPeople(search || undefined);
  }

  function handleNextPage() {
    if (!nextCursor) return;
    setCursorStack((prev) => [...prev, nextCursor]);
    loadPeople(search || undefined, nextCursor);
    window.scrollTo(0, 0);
  }

  function handlePrevPage() {
    if (cursorStack.length <= 1) return;
    const prev = cursorStack.slice(0, -1);
    setCursorStack(prev);
    loadPeople(search || undefined, prev[prev.length - 1]);
    window.scrollTo(0, 0);
  }

  const pageNumber = cursorStack.length;

  return (
    <div className={styles.page}>
      {!hasSearched && (
        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.heroEyebrow}>{siteConfig.heroEyebrow}</p>
            <h1 className={styles.heroTitle}>{siteConfig.treeName}</h1>
            <div className={styles.heroDivider} />
            <p className={styles.heroBody}>{siteConfig.heroBody}</p>
          </div>
        </header>
      )}

      <div className={styles.content}>
        <section className={styles.searchSection}>
          <h2 className={styles.searchHeading}>Find a family member</h2>
          <form onSubmit={handleSearch} className={styles.searchForm}>
            <input
              type="text"
              placeholder="Enter a first or last name..."
              aria-label="Search for a family member"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
            <button type="submit" className={styles.searchButton} disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </section>

        {error && <p className={styles.error}>{error}</p>}

        {!error && hasSearched && (
          <section className={styles.results}>
            {loading ? (
              <>
                <div className={styles.resultCountSkeleton} />
                <div className={styles.grid}>
                  {['skeleton-0', 'skeleton-1', 'skeleton-2', 'skeleton-3'].map((id) => (
                    <div key={id} className={styles.skeletonCard}>
                      <div className={styles.skeletonName} />
                      <div className={styles.skeletonLifespan} />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className={styles.resultCount}>
                  {people.length === 0
                    ? search
                      ? `No results for \u201c${search}\u201d`
                      : 'No results'
                    : search
                      ? `Results for \u201c${search}\u201d`
                      : `Showing ${people.length} ${people.length === 1 ? 'person' : 'people'}`}
                </p>
                {people.length === 0 ? (
                  <p className={styles.emptyState}>
                    No one found. Try a different name or a partial match.
                  </p>
                ) : (
                  <>
                    <div className={styles.grid}>
                      {people.map((person) => (
                        <Link
                          key={person.personId}
                          href={`/people/${person.personId}`}
                          className={styles.personCard}
                        >
                          <span className={styles.personName}>
                            {person.firstName} {person.middleName ? `${person.middleName} ` : ''}
                            {person.lastName}
                          </span>
                          <span className={styles.personLifespan}>
                            {formatLifespan(person.birthDate, person.deathDate)}
                          </span>
                        </Link>
                      ))}
                    </div>
                    {(pageNumber > 1 || nextCursor) && (
                      <div className={styles.pagination}>
                        <button
                          type="button"
                          className={styles.paginationBtn}
                          onClick={handlePrevPage}
                          disabled={pageNumber <= 1}
                        >
                          Previous
                        </button>
                        <span className={styles.pageNumber}>Page {pageNumber}</span>
                        <button
                          type="button"
                          className={styles.paginationBtn}
                          onClick={handleNextPage}
                          disabled={!nextCursor}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        )}

        <section className={styles.cta}>
          <h2 className={styles.ctaHeading}>{siteConfig.ctaHeading}</h2>
          <p className={styles.ctaBody}>
            {siteConfig.ctaBody} <Link href="/register">Register here</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <HomePageContent />
    </Suspense>
  );
}
