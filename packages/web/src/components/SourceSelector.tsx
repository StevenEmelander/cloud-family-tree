'use client';

import type { Source } from '@cloud-family-tree/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import styles from './SourceSelector.module.css';

interface SourceSelectorProps {
  sources: Source[];
  selectedSourceId: string | null;
  onSelect: (sourceId: string | null) => void;
  onSourceCreated?: (source: Source) => void;
  placeholder?: string;
  disabled?: boolean;
}

function isUrl(text: string): boolean {
  return /^https?:\/\/.+/i.test(text.trim());
}

export function SourceSelector({
  sources,
  selectedSourceId,
  onSelect,
  onSourceCreated,
  placeholder = 'Paste URL or search sources...',
  disabled,
}: SourceSelectorProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSource = sources.find((s) => s.sourceId === selectedSourceId);

  const queryTrimmed = query.trim();
  const queryIsUrl = isUrl(queryTrimmed);

  // When typing a URL, check for an existing source with that URL
  const urlMatch = queryIsUrl
    ? sources.find((s) => s.url && s.url.toLowerCase() === queryTrimmed.toLowerCase())
    : null;

  // Filter sources by title/author/url for search
  const filtered = queryTrimmed
    ? sources.filter(
        (s) =>
          s.title.toLowerCase().includes(queryTrimmed.toLowerCase()) ||
          s.author?.toLowerCase().includes(queryTrimmed.toLowerCase()) ||
          s.url?.toLowerCase().includes(queryTrimmed.toLowerCase()),
      )
    : sources;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (creating) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter' && highlightIndex >= 0 && highlightIndex < filtered.length) {
      handleSelect(filtered[highlightIndex].sourceId);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setCreating(false);
      e.preventDefault();
    }
  }

  function handleSelect(sourceId: string) {
    onSelect(sourceId);
    setQuery('');
    setOpen(false);
    setCreating(false);
  }

  function handleClear() {
    onSelect(null);
    setQuery('');
    setCreating(false);
    inputRef.current?.focus();
  }

  function startCreating() {
    setCreating(true);
    setNewTitle('');
    setError('');
  }

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    setSaving(true);
    setError('');
    try {
      const source = await api.createSource({ title, url: queryTrimmed });
      onSelect(source.sourceId);
      onSourceCreated?.(source);
      setQuery('');
      setOpen(false);
      setCreating(false);
    } catch {
      setError('Failed to create source');
    } finally {
      setSaving(false);
    }
  }

  // Selected state: show source title with clear button
  if (selectedSource) {
    return (
      <div ref={wrapperRef} className={styles.wrapper}>
        <div className={styles.selected}>
          <span className={styles.selectedTitle}>
            {selectedSource.title}
            {selectedSource.url && (
              <a
                href={selectedSource.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.selectedUrl}
                onClick={(e) => e.stopPropagation()}
              >
                {' '}
                ↗
              </a>
            )}
          </span>
          {!disabled && (
            <button type="button" className={styles.clearBtn} onClick={handleClear} title="Remove source">
              &times;
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        placeholder={placeholder}
        aria-label="Search or select a source"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlightIndex(-1);
          setCreating(false);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      {open && !creating && (
        <div className={styles.dropdown}>
          {/* URL auto-match */}
          {urlMatch && (
            <button
              type="button"
              className={`${styles.item} ${styles.urlMatch}`}
              onMouseDown={() => handleSelect(urlMatch.sourceId)}
            >
              <span className={styles.itemTitle}>{urlMatch.title}</span>
              <span className={styles.itemUrl}>Existing source matches this URL</span>
            </button>
          )}

          {/* URL not found - offer to create */}
          {queryIsUrl && !urlMatch && (
            <button
              type="button"
              className={`${styles.item} ${styles.createItem}`}
              onMouseDown={startCreating}
            >
              <span className={styles.itemTitle}>+ Create new source</span>
              <span className={styles.itemUrl}>{queryTrimmed}</span>
            </button>
          )}

          {/* Search results (skip the URL match if already shown) */}
          {filtered
            .filter((s) => s.sourceId !== urlMatch?.sourceId)
            .map((s, idx) => (
              <button
                key={s.sourceId}
                type="button"
                className={`${styles.item}${idx === highlightIndex ? ` ${styles.itemActive}` : ''}`}
                onMouseDown={() => handleSelect(s.sourceId)}
                onMouseEnter={() => setHighlightIndex(idx)}
              >
                <span className={styles.itemTitle}>{s.title}</span>
                {s.url && <span className={styles.itemUrl}>{s.url}</span>}
                {!s.url && s.author && <span className={styles.itemAuthor}>{s.author}</span>}
              </button>
            ))}

          {!queryIsUrl && filtered.length === 0 && (
            <div className={styles.noResults}>No sources found</div>
          )}
        </div>
      )}

      {/* Inline create form */}
      {creating && (
        <div className={styles.createForm}>
          <div className={styles.createUrl}>{queryTrimmed}</div>
          <input
            type="text"
            className={styles.input}
            placeholder="Source title (required)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            disabled={saving}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTitle.trim()) {
                handleCreate();
                e.preventDefault();
              } else if (e.key === 'Escape') {
                setCreating(false);
                e.preventDefault();
              }
            }}
          />
          {error && <div className={styles.createError}>{error}</div>}
          <div className={styles.createActions}>
            <button
              type="button"
              className={styles.createBtn}
              onClick={handleCreate}
              disabled={saving || !newTitle.trim()}
            >
              {saving ? 'Creating...' : 'Create Source'}
            </button>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setCreating(false)}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
