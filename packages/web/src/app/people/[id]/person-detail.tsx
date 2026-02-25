'use client';

import type { DateQualifier, Person, Relationship } from '@cloud-family-tree/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { FlexDateInput } from '@/components/FlexDateInput';
import { QualifiedDateInput } from '@/components/QualifiedDateInput';
import { ApiValidationError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { canEditPeople } from '@/lib/auth-utils';
import { formatLifespan } from '@/lib/date-utils';
import dynamic from 'next/dynamic';
import AddRelationship from './add-relationship';
import styles from './page.module.css';

const FamilyTree = dynamic(() => import('./family-tree'), { ssr: false });
const ArtifactsTab = dynamic(() => import('./artifacts-tab'), { ssr: false });
const WallTab = dynamic(() => import('./wall-tab'), { ssr: false });
const IssuesTab = dynamic(() => import('./issues-tab'), { ssr: false });

type Tab = 'tree' | 'details' | 'artifacts' | 'wall' | 'issues';

interface EditForm {
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  birthDate: string;
  birthDateQualifier: string;
  birthPlace: string;
  deathDate: string;
  deathDateQualifier: string;
  deathPlace: string;
  burialPlace: string;
  biography: string;
}

export default function PersonDetail({ id: paramId }: { id: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const canEdit = canEditPeople(user);

  const [id, setId] = useState(paramId !== '_' && paramId !== 'new' ? paramId : '');
  const [person, setPerson] = useState<Person | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('details');
  const [relatedPeople, setRelatedPeople] = useState<
    Record<
      string,
      {
        name: string;
        gender: string;
        birthDate?: string;
        birthDateQualifier?: string;
        deathDate?: string;
        deathDateQualifier?: string;
      }
    >
  >({});
  const [otherParent, setOtherParent] = useState<Record<string, string>>({});
  const [spouseParents, setSpouseParents] = useState<Record<string, string[]>>({});
  const [parentMarriages, setParentMarriages] = useState<
    Record<string, { marriageDate?: string; divorceDate?: string }>
  >({});
  const [relLoaded, setRelLoaded] = useState(false);
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(new Set());

  const switchTab = useCallback((t: Tab) => {
    setTab(t);
    setVisitedTabs((prev) => new Set(prev).add(t));
    const url = new URL(window.location.href);
    if (t === 'details') url.searchParams.delete('tab');
    else url.searchParams.set('tab', t);
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    firstName: '',
    middleName: '',
    lastName: '',
    gender: 'UNKNOWN',
    birthDate: '',
    birthDateQualifier: '',
    birthPlace: '',
    deathDate: '',
    deathDateQualifier: '',
    deathPlace: '',
    burialPlace: '',
    biography: '',
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Spouse metadata editing
  const [editingSpouse, setEditingSpouse] = useState<string | null>(null);
  const [spouseMetaForm, setSpouseMetaForm] = useState({
    marriageDate: '',
    marriagePlace: '',
    divorceDate: '',
    divorcePlace: '',
  });
  const [spouseMetaSaving, setSpouseMetaSaving] = useState(false);
  const [spouseMetaError, setSpouseMetaError] = useState<string | null>(null);

  // Relationship add
  const [addingRelationship, setAddingRelationship] = useState<
    'parent' | 'child' | 'spouse' | null
  >(null);

  useEffect(() => {
    if (!id) {
      const segments = window.location.pathname.split('/');
      const urlId = segments[segments.length - 1] || segments[segments.length - 2];
      if (urlId === 'new') {
        router.replace('/people/new');
        return;
      }
      if (urlId && urlId !== '_') {
        setId(urlId);
      }
    }
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get('tab');
    if (urlTab === 'media' || urlTab === 'photos') {
      switchTab('artifacts');
    } else if (urlTab === 'comments') {
      switchTab('wall'); // backwards compat
    } else if (
      urlTab === 'details' ||
      urlTab === 'artifacts' ||
      urlTab === 'wall' ||
      urlTab === 'issues'
    ) {
      setTab(urlTab as Tab);
    }
  }, [id, router, switchTab]);

  // Lightweight: just load person for header
  const loadPersonOnly = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPerson(id);
      setPerson(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load person');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Full load: person + relationships (for details/tree tabs)
  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const relData = await api.getPersonDetail(id);
      setPerson(relData.person);
      setRelationships(relData.items);
      setOtherParent(relData.otherParent || {});
      setSpouseParents(relData.spouseParents || {});
      setParentMarriages(relData.parentMarriages || {});
      setRelatedPeople(relData.relatedPeople || {});
      setRelLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load person');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // On mount / id change: load based on initial tab
  useEffect(() => {
    if (!id) return;
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get('tab');
    let resolvedTab = urlTab === 'media' || urlTab === 'photos' ? 'artifacts' : urlTab;
    if (resolvedTab === 'comments') resolvedTab = 'wall';
    const initialTab =
      resolvedTab === 'tree' ||
      resolvedTab === 'artifacts' ||
      resolvedTab === 'wall' ||
      resolvedTab === 'issues'
        ? (resolvedTab as Tab)
        : 'details';
    setTab(initialTab);
    setEditing(false);
    setAddingRelationship(null);
    setRelLoaded(false);
    setVisitedTabs(new Set([initialTab]));
    if (initialTab === 'details' || initialTab === 'tree') {
      loadData();
    } else {
      loadPersonOnly();
    }
  }, [id, loadData, loadPersonOnly]);

  // Lazy load relationship data when switching to details/tree
  useEffect(() => {
    if ((tab === 'details' || tab === 'tree') && !relLoaded && !loading && person) {
      loadData();
    }
  }, [tab, relLoaded, loading, person, loadData]);

  function startEditing() {
    if (!person) return;
    setEditForm({
      firstName: person.firstName,
      middleName: person.middleName || '',
      lastName: person.lastName,
      gender: person.gender,
      birthDate: person.birthDate || '',
      birthDateQualifier: person.birthDateQualifier || '',
      birthPlace: person.birthPlace || '',
      deathDate: person.deathDate || '',
      deathDateQualifier: person.deathDateQualifier || '',
      deathPlace: person.deathPlace || '',
      burialPlace: person.burialPlace || '',
      biography: person.biography || '',
    });
    setEditError(null);
    setFieldErrors({});
    setEditing(true);
  }

  async function handleSave() {
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      const errs: Record<string, string> = {};
      if (!editForm.firstName.trim()) errs.firstName = 'Required';
      if (!editForm.lastName.trim()) errs.lastName = 'Required';
      setEditError('First name and last name are required.');
      setFieldErrors(errs);
      return;
    }
    setSaving(true);
    setEditError(null);
    setFieldErrors({});
    try {
      const payload: Record<string, unknown> = {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        gender: editForm.gender,
        middleName: editForm.middleName.trim() || '',
        birthDate: editForm.birthDate || '',
        birthDateQualifier: editForm.birthDateQualifier || '',
        birthPlace: editForm.birthPlace.trim() || '',
        deathDate: editForm.deathDate || '',
        deathDateQualifier: editForm.deathDateQualifier || '',
        deathPlace: editForm.deathPlace.trim() || '',
        burialPlace: editForm.burialPlace.trim() || '',
        biography: editForm.biography.trim() || '',
      };
      await api.updatePerson(id, payload);
      setEditing(false);
      await loadData();
    } catch (err) {
      if (err instanceof ApiValidationError) {
        setEditError(err.message);
        setFieldErrors(err.fieldErrors);
      } else {
        setEditError(err instanceof Error ? err.message : 'Failed to save changes');
      }
    } finally {
      setSaving(false);
    }
  }

  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  async function handleRemoveRelationship(relationshipId: string) {
    try {
      await api.deleteRelationship(relationshipId);
      setConfirmingDelete(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove relationship');
    }
  }

  function handleRelationshipAdded() {
    setAddingRelationship(null);
    loadData();
  }

  function startEditingSpouse(r: Relationship) {
    setEditingSpouse(r.relationshipId);
    setSpouseMetaForm({
      marriageDate: r.metadata?.marriageDate || '',
      marriagePlace: r.metadata?.marriagePlace || '',
      divorceDate: r.metadata?.divorceDate || '',
      divorcePlace: r.metadata?.divorcePlace || '',
    });
    setSpouseMetaError(null);
  }

  async function handleSaveSpouseMeta() {
    if (!editingSpouse) return;
    setSpouseMetaSaving(true);
    setSpouseMetaError(null);
    try {
      await api.updateRelationship(editingSpouse, {
        metadata: {
          marriageDate: spouseMetaForm.marriageDate || undefined,
          marriagePlace: spouseMetaForm.marriagePlace.trim() || undefined,
          divorceDate: spouseMetaForm.divorceDate || undefined,
          divorcePlace: spouseMetaForm.divorcePlace.trim() || undefined,
        },
      });
      setEditingSpouse(null);
      await loadData();
    } catch (err) {
      setSpouseMetaError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSpouseMetaSaving(false);
    }
  }

  function inputClass(field: string) {
    return `${styles.formInput}${fieldErrors[field] ? ` ${styles.formInputError}` : ''}`;
  }

  if (loading)
    return (
      <div className={styles.container}>
        <p>Loading...</p>
      </div>
    );
  if (error)
    return (
      <div className={styles.container}>
        <p className={styles.error}>{error}</p>
      </div>
    );
  if (!person)
    return (
      <div className={styles.container}>
        <p>Person not found</p>
      </div>
    );

  const parents = relationships.filter(
    (r) => r.relationshipType === 'PARENT_CHILD' && r.person2Id === id,
  );
  const children = relationships.filter(
    (r) => r.relationshipType === 'PARENT_CHILD' && r.person1Id === id,
  );
  const spouses = relationships.filter((r) => r.relationshipType === 'SPOUSE');

  return (
    <div className={styles.container}>
      <div className={styles.profileHeader}>
        <h1>
          {person.firstName} {person.middleName ? `${person.middleName} ` : ''}
          {person.lastName}
        </h1>
        {canEdit && tab === 'details' && (
          <button
            type="button"
            className={editing ? styles.btnDoneEditing : styles.btnEdit}
            onClick={() => {
              if (editing) {
                setEditing(false);
                setAddingRelationship(null);
                setEditingSpouse(null);
              } else {
                startEditing();
              }
            }}
            disabled={saving}
          >
            {editing ? 'Done Editing' : 'Edit'}
          </button>
        )}
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'details' ? styles.tabActive : ''}`}
          onClick={() => switchTab('details')}
        >
          Details
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'tree' ? styles.tabActive : ''}`}
          onClick={() => switchTab('tree')}
        >
          <span className={styles.tabFull}>Family Tree</span>
          <span className={styles.tabShort}>Tree</span>
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'artifacts' ? styles.tabActive : ''}`}
          onClick={() => switchTab('artifacts')}
        >
          Artifacts
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'wall' ? styles.tabActive : ''}`}
          onClick={() => switchTab('wall')}
        >
          <span className={styles.tabFull}>Memorial Wall</span>
          <span className={styles.tabShort}>Wall</span>
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'issues' ? styles.tabActive : ''}`}
          onClick={() => switchTab('issues')}
        >
          Issues
        </button>
      </div>

      {tab === 'tree' && (
        <FamilyTree
          personName={`${person.firstName}${person.middleName ? ` ${person.middleName}` : ''} ${person.lastName}`}
          personId={id}
          personGender={person.gender}
          personBirthDate={person.birthDate}
          personBirthDateQualifier={person.birthDateQualifier}
          personDeathDate={person.deathDate}
          personDeathDateQualifier={person.deathDateQualifier}
          parents={parents.map((r) => ({
            id: r.person1Id,
            name: relatedPeople[r.person1Id]?.name || 'Loading...',
            gender: relatedPeople[r.person1Id]?.gender,
            birthDate: relatedPeople[r.person1Id]?.birthDate,
            birthDateQualifier: relatedPeople[r.person1Id]?.birthDateQualifier,
            deathDate: relatedPeople[r.person1Id]?.deathDate,
            deathDateQualifier: relatedPeople[r.person1Id]?.deathDateQualifier,
          }))}
          // biome-ignore lint/correctness/noChildrenProp: "children" is a data prop (PersonNode[]) on FamilyTree, not React children
          children={children.map((r) => ({
            id: r.person2Id,
            name: relatedPeople[r.person2Id]?.name || 'Loading...',
            gender: relatedPeople[r.person2Id]?.gender,
            birthDate: relatedPeople[r.person2Id]?.birthDate,
            birthDateQualifier: relatedPeople[r.person2Id]?.birthDateQualifier,
            deathDate: relatedPeople[r.person2Id]?.deathDate,
            deathDateQualifier: relatedPeople[r.person2Id]?.deathDateQualifier,
          }))}
          spouses={spouses.map((r) => {
            const spouseId = r.person1Id === id ? r.person2Id : r.person1Id;
            return {
              id: spouseId,
              name: relatedPeople[spouseId]?.name || 'Loading...',
              gender: relatedPeople[spouseId]?.gender,
              birthDate: relatedPeople[spouseId]?.birthDate,
              birthDateQualifier: relatedPeople[spouseId]?.birthDateQualifier,
              deathDate: relatedPeople[spouseId]?.deathDate,
              deathDateQualifier: relatedPeople[spouseId]?.deathDateQualifier,
            };
          })}
          marriages={Object.fromEntries(
            spouses.map((r) => {
              const spouseId = r.person1Id === id ? r.person2Id : r.person1Id;
              return [
                spouseId,
                { marriageDate: r.metadata?.marriageDate, divorceDate: r.metadata?.divorceDate },
              ];
            }),
          )}
          otherParent={otherParent}
          spouseParents={Object.fromEntries(
            Object.entries(spouseParents).map(([spouseId, parentIds]) => [
              spouseId,
              parentIds.map((pid) => ({
                id: pid,
                name: relatedPeople[pid]?.name || 'Loading...',
                gender: relatedPeople[pid]?.gender,
                birthDate: relatedPeople[pid]?.birthDate,
                birthDateQualifier: relatedPeople[pid]?.birthDateQualifier,
                deathDate: relatedPeople[pid]?.deathDate,
                deathDateQualifier: relatedPeople[pid]?.deathDateQualifier,
              })),
            ]),
          )}
          parentMarriages={parentMarriages}
        />
      )}

      {tab === 'details' && (
        <>
          {editing ? (
            <div className={styles.detailsCard}>
              {editError && <p className={styles.editError}>{editError}</p>}
              <div className={styles.editForm}>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>First Name *</span>
                  <input
                    type="text"
                    className={inputClass('firstName')}
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  />
                  {fieldErrors.firstName && (
                    <span className={styles.fieldError}>{fieldErrors.firstName}</span>
                  )}
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Middle Name</span>
                  <input
                    type="text"
                    className={inputClass('middleName')}
                    value={editForm.middleName}
                    onChange={(e) => setEditForm({ ...editForm, middleName: e.target.value })}
                  />
                  {fieldErrors.middleName && (
                    <span className={styles.fieldError}>{fieldErrors.middleName}</span>
                  )}
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Last Name *</span>
                  <input
                    type="text"
                    className={inputClass('lastName')}
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  />
                  {fieldErrors.lastName && (
                    <span className={styles.fieldError}>{fieldErrors.lastName}</span>
                  )}
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Gender</span>
                  <select
                    className={styles.formSelect}
                    value={editForm.gender}
                    onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                    <option value="UNKNOWN">Unknown</option>
                  </select>
                </label>
                {/* biome-ignore lint/a11y/noLabelWithoutControl: QualifiedDateInput renders its own input elements */}
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Birth Date</span>
                  <QualifiedDateInput
                    qualifier={editForm.birthDateQualifier}
                    onQualifierChange={(v) => setEditForm({ ...editForm, birthDateQualifier: v })}
                    date={editForm.birthDate}
                    onDateChange={(v) => setEditForm({ ...editForm, birthDate: v })}
                  />
                  {fieldErrors.birthDate && (
                    <span className={styles.fieldError}>{fieldErrors.birthDate}</span>
                  )}
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Birth Place</span>
                  <input
                    type="text"
                    className={inputClass('birthPlace')}
                    value={editForm.birthPlace}
                    onChange={(e) => setEditForm({ ...editForm, birthPlace: e.target.value })}
                  />
                  {fieldErrors.birthPlace && (
                    <span className={styles.fieldError}>{fieldErrors.birthPlace}</span>
                  )}
                </label>
                {/* biome-ignore lint/a11y/noLabelWithoutControl: QualifiedDateInput renders its own input elements */}
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Death Date</span>
                  <QualifiedDateInput
                    qualifier={editForm.deathDateQualifier}
                    onQualifierChange={(v) => setEditForm({ ...editForm, deathDateQualifier: v })}
                    date={editForm.deathDate}
                    onDateChange={(v) => setEditForm({ ...editForm, deathDate: v })}
                  />
                  {fieldErrors.deathDate && (
                    <span className={styles.fieldError}>{fieldErrors.deathDate}</span>
                  )}
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Death Place</span>
                  <input
                    type="text"
                    className={inputClass('deathPlace')}
                    value={editForm.deathPlace}
                    onChange={(e) => setEditForm({ ...editForm, deathPlace: e.target.value })}
                  />
                  {fieldErrors.deathPlace && (
                    <span className={styles.fieldError}>{fieldErrors.deathPlace}</span>
                  )}
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Burial Place</span>
                  <input
                    type="text"
                    className={inputClass('burialPlace')}
                    value={editForm.burialPlace}
                    onChange={(e) => setEditForm({ ...editForm, burialPlace: e.target.value })}
                  />
                  {fieldErrors.burialPlace && (
                    <span className={styles.fieldError}>{fieldErrors.burialPlace}</span>
                  )}
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Biography</span>
                  <textarea
                    className={`${styles.formTextarea}${fieldErrors.biography ? ` ${styles.formInputError}` : ''}`}
                    rows={4}
                    maxLength={5000}
                    value={editForm.biography}
                    onChange={(e) => setEditForm({ ...editForm, biography: e.target.value })}
                  />
                  {fieldErrors.biography && (
                    <span className={styles.fieldError}>{fieldErrors.biography}</span>
                  )}
                </label>
                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={styles.btnSave}
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className={styles.btnCancel}
                    onClick={() => setEditing(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.detailsCard}>
              <div className={styles.details}>
                <DetailRow label="Gender" value={person.gender} />
                {person.birthDate && (
                  <DetailRow
                    label="Born"
                    value={`${formatDate(person.birthDate, person.birthDateQualifier)}${person.birthPlace ? `, ${person.birthPlace}` : ''}`}
                  />
                )}
                {person.deathDate && (
                  <DetailRow
                    label="Died"
                    value={`${formatDate(person.deathDate, person.deathDateQualifier)}${person.deathPlace ? `, ${person.deathPlace}` : ''}`}
                  />
                )}
                {person.burialPlace && <DetailRow label="Buried" value={person.burialPlace} />}
                {person.biography && (
                  <DetailRow label="Biography" value={person.biography} linkify />
                )}
              </div>
            </div>
          )}

          <RelationshipSection
            title="Parents"
            relationships={parents}
            getId={(r) => r.person1Id}
            names={relatedPeople}
            canEdit={editing}
            confirmingDelete={confirmingDelete}
            onConfirmStart={setConfirmingDelete}
            onConfirmCancel={() => setConfirmingDelete(null)}
            onRemove={handleRemoveRelationship}
            onAdd={() => setAddingRelationship('parent')}
          />
          {addingRelationship === 'parent' && (
            <AddRelationship
              currentPersonId={id}
              currentPersonBirthDate={person.birthDate}
              relationshipRole="parent"
              onComplete={handleRelationshipAdded}
              onCancel={() => setAddingRelationship(null)}
            />
          )}

          <SpouseSection
            spouses={spouses}
            personId={id}
            names={relatedPeople}
            canEdit={editing}
            confirmingDelete={confirmingDelete}
            onConfirmStart={setConfirmingDelete}
            onConfirmCancel={() => setConfirmingDelete(null)}
            onRemove={handleRemoveRelationship}
            onAdd={() => setAddingRelationship('spouse')}
            editingSpouse={editingSpouse}
            spouseMetaForm={spouseMetaForm}
            setSpouseMetaForm={setSpouseMetaForm}
            spouseMetaSaving={spouseMetaSaving}
            spouseMetaError={spouseMetaError}
            onStartEdit={startEditingSpouse}
            onSaveMeta={handleSaveSpouseMeta}
            onCancelEdit={() => setEditingSpouse(null)}
          />
          {addingRelationship === 'spouse' && (
            <AddRelationship
              currentPersonId={id}
              currentPersonBirthDate={person.birthDate}
              relationshipRole="spouse"
              onComplete={handleRelationshipAdded}
              onCancel={() => setAddingRelationship(null)}
            />
          )}

          <RelationshipSection
            title="Children"
            relationships={children}
            getId={(r) => r.person2Id}
            names={relatedPeople}
            canEdit={editing}
            confirmingDelete={confirmingDelete}
            onConfirmStart={setConfirmingDelete}
            onConfirmCancel={() => setConfirmingDelete(null)}
            onRemove={handleRemoveRelationship}
            onAdd={() => setAddingRelationship('child')}
          />
          {addingRelationship === 'child' && (
            <AddRelationship
              currentPersonId={id}
              currentPersonBirthDate={person.birthDate}
              relationshipRole="child"
              onComplete={handleRelationshipAdded}
              onCancel={() => setAddingRelationship(null)}
            />
          )}
        </>
      )}

      {visitedTabs.has('artifacts') && (
        <div style={{ display: tab === 'artifacts' ? undefined : 'none' }}>
          <ArtifactsTab
            personId={id}
            person={person}
            personName={`${person.firstName}${person.middleName ? ` ${person.middleName}` : ''} ${person.lastName}`}
            relationships={relationships}
            relatedPeople={relatedPeople}
            onPersonUpdated={loadPersonOnly}
          />
        </div>
      )}

      {visitedTabs.has('wall') && (
        <div style={{ display: tab === 'wall' ? undefined : 'none' }}>
          <WallTab personId={id} />
        </div>
      )}

      {visitedTabs.has('issues') && (
        <div style={{ display: tab === 'issues' ? undefined : 'none' }}>
          <IssuesTab personId={id} />
        </div>
      )}
    </div>
  );
}

function Linkify({ text }: { text: string }) {
  // Match URLs allowing balanced parentheses; only exclude semicolons
  const urlRegex = /(https?:\/\/[^\s;]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part) =>
        /^https?:\/\//.test(part) ? (
          <a key={part} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          <span key={part}>{part}</span>
        ),
      )}
    </>
  );
}

function DetailRow({ label, value, linkify }: { label: string; value: string; linkify?: boolean }) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span style={linkify ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } : undefined}>
        {linkify ? <Linkify text={value} /> : value}
      </span>
    </div>
  );
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const QUALIFIER_LABELS: Record<string, string> = {
  ABT: 'About',
  BEF: 'Before',
  AFT: 'After',
  EST: 'About',
  CAL: 'About',
};

// Format a stored date (YYYY, YYYY-MM, or YYYY-MM-DD) for display
function formatDate(date: string, qualifier?: DateQualifier): string {
  const parts = date.split('-');
  let formatted: string;
  if (parts.length === 1) formatted = parts[0] ?? '';
  else if (parts.length === 2) {
    const monthIdx = Number.parseInt(parts[1] ?? '', 10) - 1;
    formatted = `${MONTH_NAMES[monthIdx]} ${parts[0]}`;
  } else {
    const monthIdx = Number.parseInt(parts[1] ?? '', 10) - 1;
    formatted = `${Number.parseInt(parts[2] ?? '', 10)} ${MONTH_NAMES[monthIdx]} ${parts[0]}`;
  }
  if (qualifier) {
    const label = QUALIFIER_LABELS[qualifier] || qualifier;
    return `${label} ${formatted}`;
  }
  return formatted;
}

function RelationshipSection({
  title,
  relationships,
  getId,
  names,
  canEdit,
  confirmingDelete,
  onConfirmStart,
  onConfirmCancel,
  onRemove,
  onAdd,
}: {
  title: string;
  relationships: Relationship[];
  getId: (r: Relationship) => string;
  names: Record<
    string,
    {
      name: string;
      gender: string;
      birthDate?: string;
      birthDateQualifier?: string;
      deathDate?: string;
      deathDateQualifier?: string;
    }
  >;
  canEdit: boolean;
  confirmingDelete: string | null;
  onConfirmStart: (id: string) => void;
  onConfirmCancel: () => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>{title}</h2>
        {canEdit && (
          <button type="button" className={styles.btnAdd} onClick={onAdd}>
            + Add
          </button>
        )}
      </div>
      {relationships.length > 0 ? (
        <div className={styles.relList}>
          {relationships.map((r) => {
            const relatedId = getId(r);
            const info = names[relatedId];
            const name = info?.name || 'Loading...';
            const life = info ? formatLifespan(info.birthDate, info.deathDate) : '';
            const isConfirming = confirmingDelete === r.relationshipId;
            return (
              <div key={r.relationshipId} className={styles.relItem}>
                <div className={styles.relLinkWrap}>
                  <Link href={`/people/${relatedId}`} className={styles.relLink}>
                    <span className={styles.relName}>{name}</span>
                    {life && <span className={styles.relLifespan}>{life}</span>}
                  </Link>
                </div>
                {canEdit && !isConfirming && (
                  <button
                    type="button"
                    className={styles.btnRemoveRel}
                    onClick={() => onConfirmStart(r.relationshipId)}
                    title="Remove relationship"
                  >
                    &times;
                  </button>
                )}
                {canEdit && isConfirming && (
                  <span className={styles.confirmDelete}>
                    <span className={styles.confirmText}>Remove?</span>
                    <button
                      type="button"
                      className={styles.btnConfirmYes}
                      onClick={() => onRemove(r.relationshipId)}
                    >
                      Yes
                    </button>
                    <button type="button" className={styles.btnConfirmNo} onClick={onConfirmCancel}>
                      No
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className={styles.emptyRel}>No {title.toLowerCase()} recorded.</p>
      )}
    </section>
  );
}

function SpouseSection({
  spouses,
  personId,
  names,
  canEdit,
  confirmingDelete,
  onConfirmStart,
  onConfirmCancel,
  onRemove,
  onAdd,
  editingSpouse,
  spouseMetaForm,
  setSpouseMetaForm,
  spouseMetaSaving,
  spouseMetaError,
  onStartEdit,
  onSaveMeta,
  onCancelEdit,
}: {
  spouses: Relationship[];
  personId: string;
  names: Record<
    string,
    {
      name: string;
      gender: string;
      birthDate?: string;
      birthDateQualifier?: string;
      deathDate?: string;
      deathDateQualifier?: string;
    }
  >;
  canEdit: boolean;
  confirmingDelete: string | null;
  onConfirmStart: (id: string) => void;
  onConfirmCancel: () => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  editingSpouse: string | null;
  spouseMetaForm: {
    marriageDate: string;
    marriagePlace: string;
    divorceDate: string;
    divorcePlace: string;
  };
  setSpouseMetaForm: (form: {
    marriageDate: string;
    marriagePlace: string;
    divorceDate: string;
    divorcePlace: string;
  }) => void;
  spouseMetaSaving: boolean;
  spouseMetaError: string | null;
  onStartEdit: (r: Relationship) => void;
  onSaveMeta: () => void;
  onCancelEdit: () => void;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Spouses</h2>
        {canEdit && (
          <button type="button" className={styles.btnAdd} onClick={onAdd}>
            + Add
          </button>
        )}
      </div>
      {spouses.length > 0 ? (
        <div className={styles.relList}>
          {spouses.map((r) => {
            const spouseId = r.person1Id === personId ? r.person2Id : r.person1Id;
            const name = names[spouseId]?.name || 'Loading...';
            const isEditing = editingSpouse === r.relationshipId;
            const isConfirming = confirmingDelete === r.relationshipId;

            const spouseInfo = names[spouseId];
            const life = spouseInfo
              ? formatLifespan(spouseInfo.birthDate, spouseInfo.deathDate)
              : '';

            const metaLines: string[] = [];
            if (r.metadata?.marriageDate || r.metadata?.marriagePlace) {
              const parts = ['Married'];
              if (r.metadata.marriageDate) parts.push(formatDate(r.metadata.marriageDate));
              if (r.metadata.marriagePlace) parts.push(`in ${r.metadata.marriagePlace}`);
              metaLines.push(parts.join(' '));
            }
            if (r.metadata?.divorceDate || r.metadata?.divorcePlace) {
              const parts = ['Divorced'];
              if (r.metadata.divorceDate) parts.push(formatDate(r.metadata.divorceDate));
              if (r.metadata.divorcePlace) parts.push(`in ${r.metadata.divorcePlace}`);
              metaLines.push(parts.join(' '));
            }

            return (
              <div key={r.relationshipId}>
                <div className={styles.relItem}>
                  <div className={styles.relLinkWrap}>
                    <Link href={`/people/${spouseId}`} className={styles.relLink}>
                      <span className={styles.relName}>{name}</span>
                      {life && <span className={styles.relLifespan}>{life}</span>}
                    </Link>
                    {metaLines.length > 0 && (
                      <div className={styles.spouseMeta}>
                        {metaLines.map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {canEdit && !isEditing && !isConfirming && (
                    <button
                      type="button"
                      className={styles.btnEditRel}
                      onClick={() => onStartEdit(r)}
                      title="Edit marriage info"
                    >
                      Edit
                    </button>
                  )}
                  {canEdit && !isConfirming && (
                    <button
                      type="button"
                      className={styles.btnRemoveRel}
                      onClick={() => onConfirmStart(r.relationshipId)}
                      title="Remove relationship"
                    >
                      &times;
                    </button>
                  )}
                  {canEdit && isConfirming && (
                    <span className={styles.confirmDelete}>
                      <span className={styles.confirmText}>Remove?</span>
                      <button
                        type="button"
                        className={styles.btnConfirmYes}
                        onClick={() => onRemove(r.relationshipId)}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={styles.btnConfirmNo}
                        onClick={onConfirmCancel}
                      >
                        No
                      </button>
                    </span>
                  )}
                </div>
                {isEditing && (
                  <div className={styles.spouseMetaForm}>
                    {spouseMetaError && <p className={styles.fieldError}>{spouseMetaError}</p>}
                    <div className={styles.spouseMetaGrid}>
                      {/* biome-ignore lint/a11y/noLabelWithoutControl: FlexDateInput renders its own input elements */}
                      <label className={styles.formField}>
                        <span className={styles.formLabel}>Marriage Date</span>
                        <FlexDateInput
                          value={spouseMetaForm.marriageDate}
                          onChange={(v) =>
                            setSpouseMetaForm({ ...spouseMetaForm, marriageDate: v })
                          }
                        />
                      </label>
                      <label className={styles.formField}>
                        <span className={styles.formLabel}>Marriage Place</span>
                        <input
                          type="text"
                          className={styles.formInput}
                          value={spouseMetaForm.marriagePlace}
                          onChange={(e) =>
                            setSpouseMetaForm({ ...spouseMetaForm, marriagePlace: e.target.value })
                          }
                        />
                      </label>
                      {/* biome-ignore lint/a11y/noLabelWithoutControl: FlexDateInput renders its own input elements */}
                      <label className={styles.formField}>
                        <span className={styles.formLabel}>Divorce Date</span>
                        <FlexDateInput
                          value={spouseMetaForm.divorceDate}
                          onChange={(v) => setSpouseMetaForm({ ...spouseMetaForm, divorceDate: v })}
                        />
                      </label>
                      <label className={styles.formField}>
                        <span className={styles.formLabel}>Divorce Place</span>
                        <input
                          type="text"
                          className={styles.formInput}
                          value={spouseMetaForm.divorcePlace}
                          onChange={(e) =>
                            setSpouseMetaForm({ ...spouseMetaForm, divorcePlace: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.formActions}>
                      <button
                        type="button"
                        className={styles.btnSave}
                        onClick={onSaveMeta}
                        disabled={spouseMetaSaving}
                      >
                        {spouseMetaSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        className={styles.btnCancel}
                        onClick={onCancelEdit}
                        disabled={spouseMetaSaving}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className={styles.emptyRel}>No spouses recorded.</p>
      )}
    </section>
  );
}
