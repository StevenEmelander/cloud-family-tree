'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { QualifiedDateInput } from '@/components/QualifiedDateInput';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { useAuth } from '@/lib/auth-context';
import { canEditPeople } from '@/lib/auth-utils';
import styles from './page.module.css';

export default function NewPersonPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const canEdit = canEditPeople(user);

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('UNKNOWN');
  const [birthDate, setBirthDate] = useState('');
  const [birthDateQualifier, setBirthDateQualifier] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [deathDateQualifier, setDeathDateQualifier] = useState('');
  const [deathPlace, setDeathPlace] = useState('');
  const [biography, setBiography] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authLoading)
    return (
      <div className={styles.container}>
        <p>Loading...</p>
      </div>
    );
  if (!canEdit)
    return (
      <div className={styles.container}>
        <p>You do not have permission to create people.</p>
      </div>
    );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
      };
      if (middleName.trim()) payload.middleName = middleName.trim();
      if (birthDate) payload.birthDate = birthDate;
      if (birthDateQualifier) payload.birthDateQualifier = birthDateQualifier;
      if (birthPlace.trim()) payload.birthPlace = birthPlace.trim();
      if (deathDate) payload.deathDate = deathDate;
      if (deathDateQualifier) payload.deathDateQualifier = deathDateQualifier;
      if (deathPlace.trim()) payload.deathPlace = deathPlace.trim();
      if (biography.trim()) payload.biography = biography.trim();
      const person = await api.createPerson(payload);
      router.push(`/people/${person.personId}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create person'));
      setSaving(false);
    }
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Add Person</h1>
      {error && <p className={styles.error}>{error}</p>}
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>First Name *</span>
          <input
            type="text"
            className={styles.input}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Middle Name</span>
          <input
            type="text"
            className={styles.input}
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Last Name *</span>
          <input
            type="text"
            className={styles.input}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Gender</span>
          <select
            className={styles.select}
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            disabled={saving}
          >
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </label>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: QualifiedDateInput renders its own input elements */}
        <label className={styles.field}>
          <span className={styles.label}>Birth Date</span>
          <QualifiedDateInput
            qualifier={birthDateQualifier}
            onQualifierChange={setBirthDateQualifier}
            date={birthDate}
            onDateChange={setBirthDate}
            disabled={saving}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Birth Place</span>
          <input
            type="text"
            className={styles.input}
            value={birthPlace}
            onChange={(e) => setBirthPlace(e.target.value)}
            disabled={saving}
          />
        </label>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: QualifiedDateInput renders its own input elements */}
        <label className={styles.field}>
          <span className={styles.label}>Death Date</span>
          <QualifiedDateInput
            qualifier={deathDateQualifier}
            onQualifierChange={setDeathDateQualifier}
            date={deathDate}
            onDateChange={setDeathDate}
            disabled={saving}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Death Place</span>
          <input
            type="text"
            className={styles.input}
            value={deathPlace}
            onChange={(e) => setDeathPlace(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Biography</span>
          <textarea
            className={styles.textarea}
            rows={4}
            maxLength={5000}
            value={biography}
            onChange={(e) => setBiography(e.target.value)}
            disabled={saving}
          />
        </label>
        <div className={styles.actions}>
          <button type="submit" className={styles.btnSubmit} disabled={saving}>
            {saving ? 'Creating...' : 'Create Person'}
          </button>
          <button
            type="button"
            className={styles.btnBack}
            onClick={() => router.back()}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
