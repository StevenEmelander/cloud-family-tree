'use client';

import type { Person } from '@cloud-family-tree/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import styles from './add-relationship.module.css';

interface AddRelationshipProps {
  currentPersonId: string;
  currentPersonBirthDate?: string;
  relationshipRole: 'parent' | 'child' | 'spouse';
  onComplete: () => void;
  onCancel: () => void;
}

function getYear(dateStr?: string): number | null {
  if (!dateStr) return null;
  const y = Number.parseInt(dateStr.slice(0, 4), 10);
  return Number.isNaN(y) ? null : y;
}

function validateTemporal(
  role: 'parent' | 'child' | 'spouse',
  currentBirthDate?: string,
  selectedBirthDate?: string,
): string | null {
  const currentYear = getYear(currentBirthDate);
  const selectedYear = getYear(selectedBirthDate);
  if (currentYear === null || selectedYear === null) return null;

  if (role === 'parent') {
    if (selectedYear >= currentYear) {
      return `Warning: This parent was born in ${selectedYear}, but the current person was born in ${currentYear}. Parent should be born before child.`;
    }
    if (selectedYear < currentYear - 80) {
      return `Warning: This parent was born in ${selectedYear}, which is ${currentYear - selectedYear} years before the current person (${currentYear}). This seems unlikely.`;
    }
  } else if (role === 'child') {
    if (selectedYear <= currentYear) {
      return `Warning: This child was born in ${selectedYear}, but the current person was born in ${currentYear}. Child should be born after parent.`;
    }
  } else if (role === 'spouse') {
    if (Math.abs(selectedYear - currentYear) > 50) {
      return `Warning: Birth years differ by ${Math.abs(selectedYear - currentYear)} years. This seems unlikely for spouses.`;
    }
  }
  return null;
}

export default function AddRelationship({
  currentPersonId,
  currentPersonBirthDate,
  relationshipRole,
  onComplete,
  onCancel,
}: AddRelationshipProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pendingPerson, setPendingPerson] = useState<Person | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // New person form
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newGender, setNewGender] = useState('UNKNOWN');

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.listPeople({ search: search.trim(), limit: 10 });
        setResults(data.items.filter((p) => p.personId !== currentPersonId));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, currentPersonId]);

  function selectPerson(person: Person) {
    const warn = validateTemporal(relationshipRole, currentPersonBirthDate, person.birthDate);
    if (warn) {
      setWarning(warn);
      setPendingPerson(person);
      return;
    }
    linkPerson(person.personId);
  }

  function confirmLink() {
    if (pendingPerson) {
      linkPerson(pendingPerson.personId);
    }
  }

  async function linkPerson(selectedId: string) {
    setLinking(true);
    setError(null);
    setWarning(null);
    setPendingPerson(null);
    try {
      if (relationshipRole === 'parent') {
        await api.createRelationship({
          relationshipType: 'PARENT_CHILD',
          person1Id: selectedId,
          person2Id: currentPersonId,
        });
      } else if (relationshipRole === 'child') {
        await api.createRelationship({
          relationshipType: 'PARENT_CHILD',
          person1Id: currentPersonId,
          person2Id: selectedId,
        });
      } else {
        await api.createRelationship({
          relationshipType: 'SPOUSE',
          person1Id: currentPersonId,
          person2Id: selectedId,
        });
      }
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create relationship');
      setLinking(false);
    }
  }

  async function handleCreateAndLink() {
    if (!newFirst.trim() || !newLast.trim()) {
      setError('First name and last name are required.');
      return;
    }
    setLinking(true);
    setError(null);
    try {
      const person = await api.createPerson({
        firstName: newFirst.trim(),
        lastName: newLast.trim(),
        gender: newGender,
      });
      await linkPerson(person.personId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create person');
      setLinking(false);
    }
  }

  const roleLabel =
    relationshipRole === 'parent' ? 'Parent' : relationshipRole === 'child' ? 'Child' : 'Spouse';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Add {roleLabel}</span>
        <button type="button" className={styles.btnClose} onClick={onCancel}>
          &times;
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {warning && pendingPerson && (
        <div className={styles.warning}>
          <p>{warning}</p>
          <div className={styles.warningActions}>
            <button
              type="button"
              className={styles.btnConfirm}
              onClick={confirmLink}
              disabled={linking}
            >
              Add Anyway
            </button>
            <button
              type="button"
              className={styles.btnCancelWarn}
              onClick={() => {
                setWarning(null);
                setPendingPerson(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showCreate && (
        <>
          <input
            ref={searchRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={linking}
          />
          {searching && <p className={styles.searchStatus}>Searching...</p>}
          {!searching && search.trim() && results.length === 0 && (
            <p className={styles.searchStatus}>No results found.</p>
          )}
          {results.length > 0 && (
            <div className={styles.results}>
              {results.map((p) => (
                <button
                  key={p.personId}
                  type="button"
                  className={styles.resultItem}
                  onClick={() => selectPerson(p)}
                  disabled={linking}
                >
                  <span className={styles.resultName}>
                    {p.firstName} {p.middleName ? `${p.middleName} ` : ''}
                    {p.lastName}
                  </span>
                  {p.birthDate && <span className={styles.resultDate}>b. {p.birthDate}</span>}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className={styles.btnCreateNew}
            onClick={() => setShowCreate(true)}
            disabled={linking}
          >
            + Create new person
          </button>
        </>
      )}

      {showCreate && (
        <div className={styles.createForm}>
          <input
            type="text"
            className={styles.formInput}
            placeholder="First name *"
            value={newFirst}
            onChange={(e) => setNewFirst(e.target.value)}
            disabled={linking}
          />
          <input
            type="text"
            className={styles.formInput}
            placeholder="Last name *"
            value={newLast}
            onChange={(e) => setNewLast(e.target.value)}
            disabled={linking}
          />
          <select
            className={styles.formSelect}
            value={newGender}
            onChange={(e) => setNewGender(e.target.value)}
            disabled={linking}
          >
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
          <div className={styles.createActions}>
            <button
              type="button"
              className={styles.btnConfirm}
              onClick={handleCreateAndLink}
              disabled={linking}
            >
              {linking ? 'Creating...' : `Create & Add as ${roleLabel}`}
            </button>
            <button
              type="button"
              className={styles.btnCancelWarn}
              onClick={() => setShowCreate(false)}
              disabled={linking}
            >
              Back to Search
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
