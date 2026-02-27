'use client';

import type { AlternateName, Citation, DateQualifier, Person, PersonEvent, Relationship, Source } from '@cloud-family-tree/shared';
import { AlternateNameType } from '@cloud-family-tree/shared';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { FlexDateInput } from '@/components/FlexDateInput';
import { QualifiedDateInput } from '@/components/QualifiedDateInput';
import { SourceSelector } from '@/components/SourceSelector';
import { ApiValidationError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { canEditPeople } from '@/lib/auth-utils';
import { formatDate, formatLifespan } from '@/lib/date-utils';
import { getErrorMessage } from '@/lib/errors';
import AddRelationship from './add-relationship';
import styles from './page.module.css';

const FamilyTree = lazy(() => import('./family-tree'));
const ArtifactsTab = lazy(() => import('./artifacts-tab'));
const WallTab = lazy(() => import('./wall-tab'));
const IssuesTab = lazy(() => import('./issues-tab'));

type Tab = 'tree' | 'details' | 'artifacts' | 'wall' | 'issues';

type RelatedPeopleMap = Record<
  string,
  { name: string; gender: string; birthDate?: string; birthDateQualifier?: string; deathDate?: string; deathDateQualifier?: string }
>;

function toPersonNode(pid: string, people: RelatedPeopleMap) {
  const p = people[pid];
  return {
    id: pid,
    name: p?.name || 'Loading...',
    gender: p?.gender,
    birthDate: p?.birthDate,
    birthDateQualifier: p?.birthDateQualifier,
    deathDate: p?.deathDate,
    deathDateQualifier: p?.deathDateQualifier,
  };
}

interface EditEvent {
  type: string;
  detail: string;
  date: string;
  dateQualifier: string;
  place: string;
  artifactId?: string;
  sourceId?: string;
}

interface EditCitation {
  sourceId: string;
  name: string;
  url: string;
}

interface EditAlternateName {
  type: string;
  firstName: string;
  lastName: string;
}

interface EditForm {
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  biography: string;
  events: EditEvent[];
  citations: EditCitation[];
  alternateNames: EditAlternateName[];
}

export default function PersonDetail({ id: paramId }: { id: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const canEdit = canEditPeople(user);

  const [id, setId] = useState(paramId !== '_' && paramId !== 'new' ? paramId : '');

  // Keep id in sync with URL for client-side navigation (static export SPA fallback)
  useEffect(() => {
    const segments = pathname.split('/');
    const urlId = segments[segments.length - 1] || segments[segments.length - 2];
    if (urlId && urlId !== '_' && urlId !== 'new' && urlId !== id) {
      setId(urlId);
    }
  }, [pathname, id]);
  const [person, setPerson] = useState<Person | null>(null);
  const personRef = useRef<Person | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('details');
  const [relatedPeople, setRelatedPeople] = useState<RelatedPeopleMap>({});
  const [otherParent, setOtherParent] = useState<Record<string, string>>({});
  const [spouseParents, setSpouseParents] = useState<Record<string, string[]>>({});
  const [parentMarriages, setParentMarriages] = useState<
    Record<string, { marriageDate?: string; divorceDate?: string }>
  >({});
  const [relLoaded, setRelLoaded] = useState(false);
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(new Set());
  const [sourcesMap, setSourcesMap] = useState<Record<string, Source>>({});
  const [allSources, setAllSources] = useState<Source[]>([]);

  const switchTab = useCallback((t: Tab) => {
    setTab(t);
    setVisitedTabs((prev) => {
      const next = new Set(prev).add(t);
      // Preload wall + issues together so switching between them is instant
      if (t === 'wall' || t === 'issues') {
        next.add('wall');
        next.add('issues');
      }
      return next;
    });
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
    biography: '',
    events: [],
    citations: [],
    alternateNames: [],
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
      switchTab(urlTab as Tab);
    }
  }, [id, router, switchTab]);

  // Lightweight: just load person for header
  const loadPersonOnly = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPerson(id);
      personRef.current = data;
      setPerson(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load person'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Full load: person + relationships (for details/tree tabs)
  const loadData = useCallback(async () => {
    if (!id) return;
    if (!personRef.current) setLoading(true);
    setError(null);
    try {
      const relData = await api.getPersonDetail(id);
      personRef.current = relData.person;
      setPerson(relData.person);
      setRelationships(relData.items);
      setOtherParent(relData.otherParent || {});
      setSpouseParents(relData.spouseParents || {});
      setParentMarriages(relData.parentMarriages || {});
      setRelatedPeople(relData.relatedPeople || {});
      setRelLoaded(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load person'));
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
    // Reset all person-specific state to prevent stale data flash
    setPerson(null);
    setRelationships([]);
    setRelatedPeople({});
    setOtherParent({});
    setSpouseParents({});
    setParentMarriages({});
    setEditingSpouse(null);
    setSpouseMetaForm({ marriageDate: '', marriagePlace: '', divorceDate: '', divorcePlace: '' });
    setEditError(null);
    setFieldErrors({});
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

  // Load sources map when person has citations
  useEffect(() => {
    if (!person?.citations?.length) return;
    const sourceIds = new Set(person.citations.map((c) => c.sourceId));
    if (sourceIds.size === 0) return;
    // Only load if we don't already have them
    const missing = [...sourceIds].filter((sid) => !sourcesMap[sid]);
    if (missing.length === 0) return;
    api.listSources().then((res) => {
      const map: Record<string, Source> = {};
      for (const s of res.items) map[s.sourceId] = s;
      setSourcesMap(map);
    }).catch(() => { /* ignore - citations will show IDs instead of titles */ });
  }, [person?.citations, sourcesMap]);

  function startEditing() {
    if (!person) return;
    // Group citations by eventType so we can attach them to their events
    const citationsByEvent: Record<string, Citation[]> = {};
    for (const c of person.citations ?? []) {
      const key = c.eventType || 'GENERAL';
      if (!citationsByEvent[key]) citationsByEvent[key] = [];
      citationsByEvent[key].push(c);
    }
    // Build core events from person top-level fields
    const coreEvents: EditEvent[] = [];
    if (person.birthDate || person.birthPlace) {
      coreEvents.push({ type: 'BIRT', detail: '', date: person.birthDate || '', dateQualifier: person.birthDateQualifier || '', place: person.birthPlace || '', sourceId: citationsByEvent.BIRT?.[0]?.sourceId });
    }
    if (person.deathDate || person.deathPlace) {
      coreEvents.push({ type: 'DEAT', detail: '', date: person.deathDate || '', dateQualifier: person.deathDateQualifier || '', place: person.deathPlace || '', sourceId: citationsByEvent.DEAT?.[0]?.sourceId });
    }
    if (person.burialPlace) {
      coreEvents.push({ type: 'BURI', detail: '', date: '', dateQualifier: '', place: person.burialPlace || '', sourceId: citationsByEvent.BURI?.[0]?.sourceId });
    }
    // General citations (not tied to any event)
    const generalCitations = (citationsByEvent.GENERAL ?? []).map((c) => {
      const src = sourcesMap[c.sourceId];
      return { sourceId: c.sourceId, name: src?.title || c.sourceId, url: src?.url || '' };
    });
    setEditForm({
      firstName: person.firstName,
      middleName: person.middleName || '',
      lastName: person.lastName,
      gender: person.gender,
      biography: person.biography || '',
      events: [
        ...coreEvents,
        ...(person.events ?? []).map((e) => ({
          type: e.type,
          detail: e.detail || '',
          date: e.date || '',
          dateQualifier: e.dateQualifier || '',
          place: e.place || '',
          artifactId: e.artifactId,
          sourceId: citationsByEvent[e.type]?.[0]?.sourceId,
        })),
      ],
      citations: generalCitations,
      alternateNames: (person.alternateNames ?? []).map((an) => ({
        type: an.type,
        firstName: an.firstName || '',
        lastName: an.lastName || '',
      })),
    });
    setEditError(null);
    setFieldErrors({});
    setEditing(true);
    // Load all sources for the citation dropdown
    if (allSources.length === 0) {
      api.listSources().then((res) => {
        setAllSources(res.items);
        const map: Record<string, Source> = {};
        for (const s of res.items) map[s.sourceId] = s;
        setSourcesMap(map);
      }).catch(() => { /* ignore */ });
    }
  }

  async function buildCitations() {
    const result: { sourceId: string; eventType?: string }[] = [];
    // Event-level citations
    for (const evt of editForm.events) {
      if (evt.sourceId && evt.type) {
        result.push({ sourceId: evt.sourceId, eventType: evt.type });
      }
    }
    // General citations (person-level)
    for (const c of editForm.citations) {
      if (!c.name.trim()) continue;
      let sid = c.sourceId;
      const name = c.name.trim();
      const url = c.url.trim() || undefined;
      const existing = allSources.find((s) => s.title === name);
      if (sid) {
        const prev = sourcesMap[sid];
        if (prev && (prev.title !== name || (prev.url || '') !== (url || ''))) {
          await api.updateSource(sid, { title: name, url: url || '' });
          setSourcesMap((m) => ({ ...m, [sid]: { ...prev, title: name, url } }));
        }
      } else if (existing) {
        sid = existing.sourceId;
      } else {
        const created = await api.createSource({ title: name, ...(url && { url }) });
        sid = created.sourceId;
        setAllSources((prev) => [...prev, created]);
        setSourcesMap((m) => ({ ...m, [created.sourceId]: created }));
      }
      result.push({ sourceId: sid, eventType: 'GENERAL' });
    }
    return result;
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
      // Extract BIRT/DEAT/BURI from events back to top-level person fields
      const birthEvt = editForm.events.find((e) => e.type === 'BIRT');
      const deathEvt = editForm.events.find((e) => e.type === 'DEAT');
      const buriEvt = editForm.events.find((e) => e.type === 'BURI');
      const otherEvents = editForm.events.filter((e) => e.type && e.type !== 'BIRT' && e.type !== 'DEAT' && e.type !== 'BURI');

      const payload: Record<string, unknown> = {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        gender: editForm.gender,
        middleName: editForm.middleName.trim() || '',
        birthDate: birthEvt?.date || '',
        birthDateQualifier: birthEvt?.dateQualifier || '',
        birthPlace: birthEvt?.place.trim() || '',
        deathDate: deathEvt?.date || '',
        deathDateQualifier: deathEvt?.dateQualifier || '',
        deathPlace: deathEvt?.place.trim() || '',
        burialPlace: buriEvt?.place.trim() || '',
        biography: editForm.biography.trim() || '',
        events: otherEvents
          .map((e) => ({
            type: e.type,
            ...(e.detail.trim() && { detail: e.detail.trim() }),
            ...(e.date && { date: e.date }),
            ...(e.dateQualifier && { dateQualifier: e.dateQualifier }),
            ...(e.place.trim() && { place: e.place.trim() }),
            ...(e.artifactId && { artifactId: e.artifactId }),
          })),
        citations: await buildCitations(),
        alternateNames: editForm.alternateNames
          .filter((an) => an.type && (an.firstName.trim() || an.lastName.trim()))
          .map((an) => ({
            type: an.type as AlternateNameType,
            ...(an.firstName.trim() && { firstName: an.firstName.trim() }),
            ...(an.lastName.trim() && { lastName: an.lastName.trim() }),
          })),
      };
      await api.updatePerson(id, payload);
      setEditing(false);
      await loadData();
    } catch (err) {
      if (err instanceof ApiValidationError) {
        setEditError(err.message);
        setFieldErrors(err.fieldErrors);
      } else {
        setEditError(getErrorMessage(err, 'Failed to save changes'));
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
      setError(getErrorMessage(err, 'Failed to remove relationship'));
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
      setSpouseMetaError(getErrorMessage(err, 'Failed to save'));
    } finally {
      setSpouseMetaSaving(false);
    }
  }

  function inputClass(field: string) {
    return `${styles.formInput}${fieldErrors[field] ? ` ${styles.formInputError}` : ''}`;
  }

  const textField = (label: string, field: Exclude<keyof EditForm, 'events' | 'citations' | 'alternateNames'>, required?: boolean) => (
    <label key={field} className={styles.formField}>
      <span className={styles.formLabel}>{label}{required ? ' *' : ''}</span>
      <input
        type="text"
        className={inputClass(field)}
        value={editForm[field]}
        onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })}
      />
      {fieldErrors[field] && <span className={styles.fieldError}>{fieldErrors[field]}</span>}
    </label>
  );

  if (loading && !person)
    return (
      <div className={styles.container}>
        <p>Loading...</p>
      </div>
    );
  if (error && !person)
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
        <Suspense><FamilyTree
          key={id}
          personName={`${person.firstName}${person.middleName ? ` ${person.middleName}` : ''} ${person.lastName}`}
          personId={id}
          personGender={person.gender}
          personBirthDate={person.birthDate}
          personBirthDateQualifier={person.birthDateQualifier}
          personDeathDate={person.deathDate}
          personDeathDateQualifier={person.deathDateQualifier}
          parents={parents.map((r) => toPersonNode(r.person1Id, relatedPeople))}
          // biome-ignore lint/correctness/noChildrenProp: "children" is a data prop (PersonNode[]) on FamilyTree, not React children
          children={children.map((r) => toPersonNode(r.person2Id, relatedPeople))}
          spouses={spouses.map((r) => toPersonNode(r.person1Id === id ? r.person2Id : r.person1Id, relatedPeople))}
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
              parentIds.map((pid) => toPersonNode(pid, relatedPeople)),
            ]),
          )}
          parentMarriages={parentMarriages}
        /></Suspense>
      )}

      {tab === 'details' && (
        <>
          {editing ? (
            <div className={styles.detailsCard}>
              {editError && <p className={styles.editError}>{editError}</p>}
              <div className={styles.editForm}>
                {textField('First Name', 'firstName', true)}
                {textField('Middle Name', 'middleName')}
                {textField('Last Name', 'lastName', true)}
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

                {/* Events editor */}
                <div className={styles.eventsEditor}>
                  <div className={styles.eventsEditorHeader}>
                    <span className={styles.formLabel}>Events &amp; Attributes</span>
                    <button
                      type="button"
                      className={styles.btnAddEvent}
                      onClick={() =>
                        setEditForm({
                          ...editForm,
                          events: [...editForm.events, { type: '', detail: '', date: '', dateQualifier: '', place: '' }],
                        })
                      }
                    >
                      + Add
                    </button>
                  </div>
                  {editForm.events.map((evt, i) => (
                    <div key={i} className={styles.eventBlock}>
                      <div className={styles.eventBlockHeader}>
                        {evt.artifactId ? (
                          <span className={styles.artifactLinkedType}>
                            {EVENT_TYPE_LABELS[evt.type] || evt.type}
                          </span>
                        ) : (
                          <select
                            className={styles.formSelect}
                            value={evt.type}
                            onChange={(e) => {
                              const updated = [...editForm.events];
                              updated[i] = { ...evt, type: e.target.value };
                              setEditForm({ ...editForm, events: updated });
                            }}
                          >
                            <option value="">Select type...</option>
                            {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        )}
                        {!evt.artifactId && (
                          <button
                            type="button"
                            className={styles.btnRemoveEvent}
                            onClick={() => {
                              const updated = editForm.events.filter((_, j) => j !== i);
                              setEditForm({ ...editForm, events: updated });
                            }}
                            title="Remove"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                      {(EVENT_FIELDS[evt.type] ?? DEFAULT_EVENT_FIELDS).date && (
                        /* biome-ignore lint/a11y/noLabelWithoutControl: QualifiedDateInput renders its own input elements */
                        <label className={styles.eventBlockField}>
                          <span className={styles.eventFieldLabel}>Date</span>
                          <QualifiedDateInput
                            qualifier={evt.dateQualifier}
                            onQualifierChange={(v) => {
                              const updated = [...editForm.events];
                              updated[i] = { ...evt, dateQualifier: v };
                              setEditForm({ ...editForm, events: updated });
                            }}
                            date={evt.date}
                            onDateChange={(v) => {
                              const updated = [...editForm.events];
                              updated[i] = { ...evt, date: v };
                              setEditForm({ ...editForm, events: updated });
                            }}
                          />
                        </label>
                      )}
                      {(EVENT_FIELDS[evt.type] ?? DEFAULT_EVENT_FIELDS).place && (
                        <label className={styles.eventBlockField}>
                          <span className={styles.eventFieldLabel}>Place</span>
                          <input
                            type="text"
                            className={styles.formInput}
                            placeholder={(EVENT_FIELDS[evt.type] ?? DEFAULT_EVENT_FIELDS).place as string}
                            value={evt.place}
                            onChange={(e) => {
                              const updated = [...editForm.events];
                              updated[i] = { ...evt, place: e.target.value };
                              setEditForm({ ...editForm, events: updated });
                            }}
                          />
                        </label>
                      )}
                      {(EVENT_FIELDS[evt.type] ?? DEFAULT_EVENT_FIELDS).detail && (
                        <label className={styles.eventBlockField}>
                          <span className={styles.eventFieldLabel}>Detail</span>
                          <input
                            type="text"
                            className={styles.formInput}
                            placeholder={(EVENT_FIELDS[evt.type] ?? DEFAULT_EVENT_FIELDS).detail as string}
                            value={evt.detail}
                            onChange={(e) => {
                              const updated = [...editForm.events];
                              updated[i] = { ...evt, detail: e.target.value };
                              setEditForm({ ...editForm, events: updated });
                            }}
                          />
                        </label>
                      )}
                      <div className={styles.eventBlockField}>
                        <span className={styles.eventFieldLabel}>Source</span>
                        <SourceSelector
                          sources={allSources}
                          selectedSourceId={evt.sourceId || null}
                          onSelect={(sid) => {
                            const updated = [...editForm.events];
                            updated[i] = { ...evt, sourceId: sid || undefined };
                            setEditForm({ ...editForm, events: updated });
                          }}
                          onSourceCreated={(s) => setAllSources((prev) => [...prev, s])}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Alternate Names editor */}
                <div className={styles.eventsEditor}>
                  <div className={styles.eventsEditorHeader}>
                    <span className={styles.formLabel}>Alternate Names</span>
                    <button
                      type="button"
                      className={styles.btnAddEvent}
                      onClick={() =>
                        setEditForm({
                          ...editForm,
                          alternateNames: [...editForm.alternateNames, { type: '', firstName: '', lastName: '' }],
                        })
                      }
                    >
                      + Add
                    </button>
                  </div>
                  {editForm.alternateNames.map((an, i) => (
                    <div key={i} className={styles.altNameRow}>
                      <select
                        className={styles.formSelect}
                        value={an.type}
                        onChange={(e) => {
                          const updated = [...editForm.alternateNames];
                          updated[i] = { ...an, type: e.target.value };
                          setEditForm({ ...editForm, alternateNames: updated });
                        }}
                      >
                        <option value="">Select type...</option>
                        {Object.values(AlternateNameType).map((t) => (
                          <option key={t} value={t}>{NAME_TYPE_LABELS[t] || t}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="First Name"
                        value={an.firstName}
                        onChange={(e) => {
                          const updated = [...editForm.alternateNames];
                          updated[i] = { ...an, firstName: e.target.value };
                          setEditForm({ ...editForm, alternateNames: updated });
                        }}
                      />
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="Last Name"
                        value={an.lastName}
                        onChange={(e) => {
                          const updated = [...editForm.alternateNames];
                          updated[i] = { ...an, lastName: e.target.value };
                          setEditForm({ ...editForm, alternateNames: updated });
                        }}
                      />
                      <button
                        type="button"
                        className={styles.btnRemoveEvent}
                        onClick={() => {
                          const updated = editForm.alternateNames.filter((_, j) => j !== i);
                          setEditForm({ ...editForm, alternateNames: updated });
                        }}
                        title="Remove"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>

                {/* Sources editor */}
                <div className={styles.eventsEditor}>
                  <div className={styles.eventsEditorHeader}>
                    <span className={styles.formLabel}>Sources</span>
                    <button
                      type="button"
                      className={styles.btnAddEvent}
                      onClick={() =>
                        setEditForm({
                          ...editForm,
                          citations: [...editForm.citations, { sourceId: '', name: '', url: '' }],
                        })
                      }
                    >
                      + Add
                    </button>
                  </div>
                  {editForm.citations.map((cit, i) => (
                    <div key={i} className={styles.citationRow}>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="Name"
                        value={cit.name}
                        onChange={(e) => {
                          const updated = [...editForm.citations];
                          updated[i] = { ...cit, name: e.target.value, sourceId: '' };
                          setEditForm({ ...editForm, citations: updated });
                        }}
                      />
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="URL (optional)"
                        value={cit.url}
                        onChange={(e) => {
                          const updated = [...editForm.citations];
                          updated[i] = { ...cit, url: e.target.value, sourceId: '' };
                          setEditForm({ ...editForm, citations: updated });
                        }}
                      />
                      <button
                        type="button"
                        className={styles.btnRemoveEvent}
                        onClick={() => {
                          const updated = editForm.citations.filter((_, j) => j !== i);
                          setEditForm({ ...editForm, citations: updated });
                        }}
                        title="Remove"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>

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
                {person.biography && (
                  <DetailRow label="Biography" value={person.biography} linkify />
                )}
                {(() => {
                  const allEvents: { type: string; date?: string; dateQualifier?: string; place?: string; detail?: string; artifactId?: string }[] = [];
                  if (person.birthDate || person.birthPlace) allEvents.push({ type: 'BIRT', date: person.birthDate, dateQualifier: person.birthDateQualifier, place: person.birthPlace });
                  if (person.deathDate || person.deathPlace) allEvents.push({ type: 'DEAT', date: person.deathDate, dateQualifier: person.deathDateQualifier, place: person.deathPlace });
                  if (person.burialPlace) allEvents.push({ type: 'BURI', place: person.burialPlace });
                  if (person.events) allEvents.push(...person.events);
                  // Track per-type index for matching eventIndex on citations
                  const typeIndexMap: Record<string, number> = {};
                  return allEvents.map((ev, i) => {
                    const evIdx = (typeIndexMap[ev.type] ?? 0);
                    typeIndexMap[ev.type] = evIdx + 1;
                    const eventCitations = (person.citations ?? []).filter((c) => {
                      if (c.eventType !== ev.type) return false;
                      // If citation has an eventIndex, match it to the correct event instance
                      if (c.eventIndex !== undefined && c.eventIndex !== null) return c.eventIndex === evIdx;
                      return true; // legacy citations without eventIndex show on all events of that type
                    });
                    return (
                      <DetailRow
                        key={`${ev.type}-${i}`}
                        label={formatEventType(ev.type)}
                        value={[
                          ev.date && formatDate(ev.date, ev.dateQualifier),
                          ev.place,
                          ev.detail,
                        ]
                          .filter(Boolean)
                          .join(' — ')}
                        citations={eventCitations.length > 0 ? eventCitations : undefined}
                        sourcesMap={sourcesMap}
                      />
                    );
                  });
                })()}
                {person.alternateNames && person.alternateNames.length > 0 &&
                  person.alternateNames.map((an, i) => (
                    <DetailRow
                      key={`alt-${an.type}-${i}`}
                      label={formatNameType(an.type)}
                      value={[an.prefix, an.firstName, an.middleName, an.lastName, an.suffix]
                        .filter(Boolean)
                        .join(' ')}
                    />
                  ))
                }
              </div>
              {person.citations && person.citations.filter((c) => !c.eventType || c.eventType === 'GENERAL').length > 0 && (
                <CitationsSection citations={person.citations.filter((c) => !c.eventType || c.eventType === 'GENERAL')} sourcesMap={sourcesMap} />
              )}
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
          <Suspense>
            <ArtifactsTab
              personId={id}
              person={person}
              personName={`${person.firstName}${person.middleName ? ` ${person.middleName}` : ''} ${person.lastName}`}
              relationships={relationships}
              relatedPeople={relatedPeople}
              onPersonUpdated={loadPersonOnly}
            />
          </Suspense>
        </div>
      )}

      {visitedTabs.has('wall') && (
        <div style={{ display: tab === 'wall' ? undefined : 'none' }}>
          <Suspense><WallTab personId={id} /></Suspense>
        </div>
      )}

      {visitedTabs.has('issues') && (
        <div style={{ display: tab === 'issues' ? undefined : 'none' }}>
          <Suspense><IssuesTab personId={id} /></Suspense>
        </div>
      )}
    </div>
  );
}

const URL_REGEX = /(https?:\/\/[^\s;]+)/g;

function DetailRow({ label, value, linkify, citations, sourcesMap }: { label: string; value: string; linkify?: boolean; citations?: Citation[]; sourcesMap?: Record<string, Source> }) {
  const [showSources, setShowSources] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSources) return;
    function handleClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setShowSources(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSources]);

  const hasCitations = citations && citations.length > 0 && sourcesMap;

  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span style={linkify ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } : undefined}>
        {linkify
          ? value.split(URL_REGEX).map((part) =>
              /^https?:\/\//.test(part) ? (
                <a key={part} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
              ) : (
                <span key={part}>{part}</span>
              ),
            )
          : value}
      </span>
      {hasCitations && (
        <div className={styles.sourceIconWrap} ref={popRef}>
          <button
            type="button"
            className={styles.sourceIconBtn}
            onClick={() => setShowSources(!showSources)}
            title={`${citations.length} source${citations.length !== 1 ? 's' : ''}`}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true">
              <path d="M2 2a2 2 0 012-2h4.586A2 2 0 0110 .586L13.414 4A2 2 0 0114 5.414V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2zm5 1a1 1 0 100 2h2a1 1 0 100-2H7zM5 7a1 1 0 000 2h6a1 1 0 100-2H5zm0 3a1 1 0 100 2h4a1 1 0 100-2H5z" />
            </svg>
          </button>
          {showSources && (
            <div className={styles.sourcePopover}>
              <div className={styles.sourcePopoverTitle}>Sources</div>
              {citations.map((c, ci) => {
                const source = sourcesMap[c.sourceId];
                const title = source?.title || c.sourceId;
                const url = source?.url;
                return (
                  <div key={`${c.sourceId}-${ci}`} className={styles.sourcePopoverItem}>
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer">{title}</a>
                    ) : (
                      <span>{title}</span>
                    )}
                    {c.page && <span className={styles.sourcePopoverPage}> — {c.page}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
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
  names: RelatedPeopleMap;
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
  names: RelatedPeopleMap;
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

const NAME_TYPE_LABELS: Record<string, string> = {
  AKA: 'Also Known As',
  BIRTH: 'Birth Name',
  MAIDEN: 'Maiden Name',
  MARRIED: 'Married Name',
  PROFESSIONAL: 'Professional Name',
  IMMIGRANT: 'Immigrant Name',
  OTHER: 'Other',
};

function formatNameType(type: string): string {
  return NAME_TYPE_LABELS[type] || type;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  BIRT: 'Birth',
  DEAT: 'Death',
  BURI: 'Burial',
  CHR: 'Christening',
  CREM: 'Cremation',
  RESI: 'Residence',
  OCCU: 'Occupation',
  EDUC: 'Education',
  IMMI: 'Immigration',
  EMIG: 'Emigration',
  CENS: 'Census',
  RELI: 'Religion',
  NATU: 'Naturalization',
  MILI: 'Military Service',
  GRAD: 'Graduation',
  RETI: 'Retirement',
  WILL: 'Will',
  PROB: 'Probate',
  BAPM: 'Baptism',
  BARM: 'Bar Mitzvah',
  BASM: 'Bas Mitzvah',
  CONF: 'Confirmation',
  ORDN: 'Ordination',
  ADOP: 'Adoption',
  FCOM: 'First Communion',
  DSCR: 'Physical Description',
  NATI: 'Nationality',
  TITL: 'Title',
  EVEN: 'Event',
  FACT: 'Fact',
};

interface EventFieldConfig {
  date?: boolean;
  place?: string; // placeholder text, or false-y to hide
  detail?: string; // placeholder text, or false-y to hide
}

const EVENT_FIELDS: Record<string, EventFieldConfig> = {
  BIRT: { date: true, place: 'Birth place' },
  DEAT: { date: true, place: 'Death place' },
  BURI: { date: true, place: 'Burial place' },
  CHR:  { date: true, place: 'Church / Location' },
  CREM: { date: true, place: 'Location' },
  RESI: { date: true, place: 'Address' },
  OCCU: { date: true, detail: 'Job title' },
  EDUC: { date: true, place: 'School / Institution', detail: 'Degree / Field' },
  IMMI: { date: true, place: 'Destination' },
  EMIG: { date: true, place: 'Departed from' },
  CENS: { date: true, place: 'Location' },
  RELI: { detail: 'Denomination' },
  NATU: { date: true, place: 'Court / Location' },
  MILI: { date: true, detail: 'Branch / Rank' },
  GRAD: { date: true, place: 'School', detail: 'Degree' },
  RETI: { date: true },
  WILL: { date: true },
  PROB: { date: true, place: 'Court' },
  BAPM: { date: true, place: 'Church / Location' },
  BARM: { date: true, place: 'Synagogue / Location' },
  BASM: { date: true, place: 'Synagogue / Location' },
  CONF: { date: true, place: 'Church / Location' },
  ORDN: { date: true, place: 'Location' },
  ADOP: { date: true, place: 'Location' },
  FCOM: { date: true, place: 'Church / Location' },
  DSCR: { detail: 'Description' },
  NATI: { detail: 'Nationality' },
  TITL: { detail: 'Title' },
  EVEN: { date: true, place: 'Place', detail: 'Description' },
  FACT: { detail: 'Value' },
};

const DEFAULT_EVENT_FIELDS: EventFieldConfig = { date: true, place: 'Place', detail: 'Detail' };

function formatEventType(type: string): string {
  return EVENT_TYPE_LABELS[type] || type;
}

function CitationsSection({
  citations,
  sourcesMap,
}: {
  citations: Citation[];
  sourcesMap: Record<string, Source>;
}) {
  return (
    <div className={styles.citationsSection}>
      <span className={styles.citationsLabel}>Sources:</span>
      {citations.map((c, i) => {
        const source = sourcesMap[c.sourceId];
        const title = source?.title || c.sourceId;
        const url = source?.url;
        return (
          <span key={`${c.sourceId}-${i}`} className={styles.citationBadge}>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer">
                {title}
              </a>
            ) : (
              title
            )}
          </span>
        );
      })}
    </div>
  );
}
