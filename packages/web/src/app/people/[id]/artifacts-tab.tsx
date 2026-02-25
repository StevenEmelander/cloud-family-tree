'use client';

import type {
  Artifact,
  Person,
  Relationship,
  RelationshipMetadata,
} from '@cloud-family-tree/shared';
import { ArtifactType } from '@cloud-family-tree/shared';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlexDateInput } from '@/components/FlexDateInput';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { canEditPeople } from '@/lib/auth-utils';
import { formatLifespan } from '@/lib/date-utils';
import styles from './artifacts-tab.module.css';

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
const IMAGE_AND_PDF_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const RECORD_TYPES = new Set([
  ArtifactType.BIRTH_RECORD,
  ArtifactType.DEATH_RECORD,
  ArtifactType.MARRIAGE_RECORD,
  ArtifactType.DIVORCE_RECORD,
  ArtifactType.CENSUS_RECORD,
  ArtifactType.IMMIGRATION_RECORD,
]);

const TYPE_LABELS: Record<string, string> = {
  PHOTO: 'Photo',
  GRAVE: 'Grave',
  BIRTH_RECORD: 'Birth Record',
  DEATH_RECORD: 'Death Record',
  MARRIAGE_RECORD: 'Marriage Record',
  DIVORCE_RECORD: 'Divorce Record',
  CENSUS_RECORD: 'Census Record',
  IMMIGRATION_RECORD: 'Immigration Record',
  OTHER: 'Other',
};

const TYPE_BADGE_CLASS: Record<string, string> = {
  PHOTO: 'badgePhoto',
  GRAVE: 'badgeGrave',
  BIRTH_RECORD: 'badgeBirth',
  DEATH_RECORD: 'badgeDeath',
  MARRIAGE_RECORD: 'badgeMarriage',
  DIVORCE_RECORD: 'badgeDivorce',
  CENSUS_RECORD: 'badgeCensus',
  IMMIGRATION_RECORD: 'badgeImmigration',
  OTHER: 'badgeOther',
};

function formatSource(source: string): { text: string; href?: string } {
  if (source.startsWith('http')) {
    try {
      return { text: new URL(source).hostname.replace(/^www\./, ''), href: source };
    } catch {
      return { text: source, href: source };
    }
  }
  return { text: source };
}

type FilterType = 'all' | 'photos' | 'records' | 'graves';

interface ArtifactWithUrl extends Artifact {
  viewUrl?: string;
}

interface RelatedPerson {
  name: string;
  gender: string;
  birthDate?: string;
  birthDateQualifier?: string;
  deathDate?: string;
  deathDateQualifier?: string;
}

// Per-person editable evidence fields
interface PersonEvidence {
  id: string;
  name: string;
  relationship: string; // Primary, Spouse, Parent, Child, or Search
  birthDate: string;
  birthDateQualifier: string;
  deathDate: string;
  deathDateQualifier: string;
  burialPlace: string;
  isPrimary: boolean; // true for the person whose page this is
}

interface ArtifactsTabProps {
  personId: string;
  person: Person;
  personName: string;
  relationships: Relationship[];
  relatedPeople: Record<string, RelatedPerson>;
  onPersonUpdated?: () => void;
}

export default function ArtifactsTab({
  personId,
  person,
  personName,
  relationships,
  relatedPeople,
  onPersonUpdated,
}: ArtifactsTabProps) {
  const { user } = useAuth();
  const canEdit = canEditPeople(user);

  const [artifacts, setArtifacts] = useState<ArtifactWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [artifactType, setArtifactType] = useState<ArtifactType>(ArtifactType.PHOTO);
  const [caption, setCaption] = useState('');
  const [source, setSource] = useState('');
  const [recordDate, setRecordDate] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Type-specific fields
  const [cemeteryLocation, setCemeteryLocation] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [deathPlace, setDeathPlace] = useState('');

  // Census/Immigration-specific fields
  const [censusLocation, setCensusLocation] = useState('');
  const [shipName, setShipName] = useState('');
  const [portOfArrival, setPortOfArrival] = useState('');

  // Marriage/Divorce record: spouse selector
  const [selectedSpouseRelId, setSelectedSpouseRelId] = useState('');
  const [marriageDate, setMarriageDate] = useState('');
  const [marriagePlace, setMarriagePlace] = useState('');
  const [divorceDate, setDivorceDate] = useState('');
  const [divorcePlace, setDivorcePlace] = useState('');

  // Person association state
  const [selectedPeople, setSelectedPeople] = useState<Map<string, PersonEvidence>>(new Map());
  const [showOtherSearch, setShowOtherSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);

  // Lightbox state
  const [lightboxArtifact, setLightboxArtifact] = useState<ArtifactWithUrl | null>(null);
  const [lightboxAssociations, setLightboxAssociations] = useState<
    { personId: string; name: string }[]
  >([]);
  const [lightboxAssocLoading, setLightboxAssocLoading] = useState(false);
  const lightboxArtifactRef = useRef<string | null>(null);

  // Edit mode: reuses the upload form state, driven by editingArtifact
  const [editingArtifact, setEditingArtifact] = useState<ArtifactWithUrl | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [originalAssociations, setOriginalAssociations] = useState<Set<string>>(new Set());

  // Set default source from user name
  useEffect(() => {
    if (user?.name && !source) {
      setSource(user.name);
    }
  }, [user?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadArtifacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listArtifacts(personId);
      const items: ArtifactWithUrl[] = data.items;

      // Fetch view URLs for image artifacts
      await Promise.all(
        items.map(async (item) => {
          if (item.contentType.startsWith('image/')) {
            try {
              const { url } = await api.getArtifactUrl(item.artifactId, personId);
              item.viewUrl = url;
            } catch {
              // URL fetch failed
            }
          }
        }),
      );

      setArtifacts(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artifacts');
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  // Lightbox open/close
  async function openLightbox(artifact: ArtifactWithUrl) {
    setLightboxArtifact(artifact);
    lightboxArtifactRef.current = artifact.artifactId;
    setLightboxAssociations([]);
    setLightboxAssocLoading(true);
    try {
      const { associations } = await api.getArtifactAssociations(artifact.artifactId, personId);
      if (lightboxArtifactRef.current === artifact.artifactId) {
        setLightboxAssociations(associations);
      }
    } catch {
      // ignore
    } finally {
      if (lightboxArtifactRef.current === artifact.artifactId) {
        setLightboxAssocLoading(false);
      }
    }
  }

  function closeLightbox() {
    setLightboxArtifact(null);
    lightboxArtifactRef.current = null;
    setLightboxAssociations([]);
    setLightboxAssocLoading(false);
  }

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxArtifact) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeLightbox();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxArtifact]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: get spouse relationships
  function getSpouseRelationships() {
    return relationships.filter((r) => r.relationshipType === 'SPOUSE');
  }

  // Helper: get spouse ID from relationship
  function getSpouseId(r: Relationship) {
    return r.person1Id === personId ? r.person2Id : r.person1Id;
  }

  // Helper: parse year from a flex date string
  function parseYear(date?: string): number | null {
    if (!date) return null;
    const y = Number.parseInt(date.slice(0, 4), 10);
    return Number.isNaN(y) ? null : y;
  }

  // Helper: check if person was alive at a given year
  function isAliveAtYear(personInfo: RelatedPerson, year: number): boolean {
    const birthYear = parseYear(personInfo.birthDate);
    const deathYear = parseYear(personInfo.deathDate);
    if (birthYear && birthYear > year) return false;
    if (deathYear && deathYear < year) return false;
    return true; // alive or unknown
  }

  // Helper: check if person died underage (before 18)
  function diedUnderage(personInfo: RelatedPerson): boolean {
    const birthYear = parseYear(personInfo.birthDate);
    const deathYear = parseYear(personInfo.deathDate);
    if (!birthYear || !deathYear) return false;
    return deathYear - birthYear < 18;
  }

  // Create a PersonEvidence entry for a person
  function makeEvidence(
    id: string,
    name: string,
    relationship: string,
    isPrimary = false,
  ): PersonEvidence {
    const info =
      id === personId
        ? {
            birthDate: person.birthDate,
            birthDateQualifier: person.birthDateQualifier,
            deathDate: person.deathDate,
            deathDateQualifier: person.deathDateQualifier,
          }
        : relatedPeople[id];
    return {
      id,
      name,
      relationship,
      birthDate: info?.birthDate || '',
      birthDateQualifier: info?.birthDateQualifier || '',
      deathDate: info?.deathDate || '',
      deathDateQualifier: info?.deathDateQualifier || '',
      burialPlace: '',
      isPrimary,
    };
  }

  // Build suggestions based on artifact type and auto-populate people
  function buildAndSetSuggestions(type: ArtifactType, dateStr?: string) {
    const people = new Map<string, PersonEvidence>();

    // Always include the primary person first
    people.set(personId, makeEvidence(personId, personName, 'Primary', true));

    const parents = relationships.filter(
      (r) => r.relationshipType === 'PARENT_CHILD' && r.person2Id === personId,
    );
    const children = relationships.filter(
      (r) => r.relationshipType === 'PARENT_CHILD' && r.person1Id === personId,
    );
    const spouses = getSpouseRelationships();

    const add = (id: string, relationship: string) => {
      if (id === personId || people.has(id)) return;
      const info = relatedPeople[id];
      if (!info) return;
      people.set(id, makeEvidence(id, info.name, relationship));
    };

    switch (type) {
      case ArtifactType.PHOTO:
        // Only current person, no auto-suggestions
        break;

      case ArtifactType.OTHER:
        // Like photo: only current person, no auto-suggestions
        break;

      case ArtifactType.GRAVE: {
        // Suggest only spouse at time of death (not divorced before death)
        const deathYear = parseYear(person.deathDate);
        for (const r of spouses) {
          const divorceYear = parseYear(r.metadata?.divorceDate);
          // Skip spouses divorced before death
          if (divorceYear && deathYear && divorceYear < deathYear) continue;
          add(getSpouseId(r), 'Spouse');
        }
        break;
      }

      case ArtifactType.BIRTH_RECORD:
      case ArtifactType.DEATH_RECORD:
        // No associations for birth/death records
        break;

      case ArtifactType.MARRIAGE_RECORD:
      case ArtifactType.DIVORCE_RECORD:
        // Spouse handled via spouse selector, not associations
        break;

      case ArtifactType.CENSUS_RECORD:
      case ArtifactType.IMMIGRATION_RECORD: {
        const year = parseYear(dateStr);
        for (const r of spouses) {
          const spouseId = getSpouseId(r);
          const info = relatedPeople[spouseId];
          if (info && (!year || isAliveAtYear(info, year))) {
            const ev = makeEvidence(spouseId, info.name, 'Spouse');
            if (year) {
              if (!ev.birthDate) {
                ev.birthDate = String(year);
                ev.birthDateQualifier = 'BEF';
              }
              if (!ev.deathDate) {
                ev.deathDate = String(year);
                ev.deathDateQualifier = 'AFT';
              }
            }
            people.set(spouseId, ev);
          }
        }
        for (const r of children) {
          const info = relatedPeople[r.person2Id];
          if (info) {
            const childBirthYear = parseYear(info.birthDate);
            const isUnderage = year && childBirthYear ? year - childBirthYear < 18 : true;
            if (isUnderage && (!year || isAliveAtYear(info, year))) {
              const ev = makeEvidence(r.person2Id, info.name, 'Child');
              if (year) {
                if (!ev.birthDate) {
                  ev.birthDate = String(year);
                  ev.birthDateQualifier = 'BEF';
                }
                if (!ev.deathDate) {
                  ev.deathDate = String(year);
                  ev.deathDateQualifier = 'AFT';
                }
              }
              people.set(r.person2Id, ev);
            }
          }
        }
        break;
      }
    }

    setSelectedPeople(people);
  }

  // When type changes, rebuild suggestions and reset only type-specific fields
  // Shared fields (file, caption, source) are preserved across type changes
  // Skip this reset when entering edit mode (startEditing sets artifactType and
  // field values in the same batch; this effect would otherwise wipe them out)
  useEffect(() => {
    if (editingArtifact) return;
    buildAndSetSuggestions(artifactType, recordDate);
    // Reset only type-specific fields
    setCemeteryLocation('');
    setCensusLocation('');
    setShipName('');
    setPortOfArrival('');
    setBirthPlace(person.birthPlace || '');
    setDeathPlace(person.deathPlace || '');
    setMarriageDate('');
    setMarriagePlace('');
    setDivorceDate('');
    setDivorcePlace('');
    setSelectedSpouseRelId('');
    setShowOtherSearch(false);
    setSearchQuery('');
    setSearchResults([]);

    // Pre-fill date from person's existing data for birth/death records
    if (artifactType === ArtifactType.BIRTH_RECORD) {
      setRecordDate(person.birthDate || '');
    } else if (artifactType === ArtifactType.DEATH_RECORD) {
      setRecordDate(person.deathDate || '');
    }

    // Pre-fill marriage/divorce fields from first spouse relationship
    if (
      artifactType === ArtifactType.MARRIAGE_RECORD ||
      artifactType === ArtifactType.DIVORCE_RECORD
    ) {
      const spouses = getSpouseRelationships();
      if (spouses.length > 0) {
        const rel = spouses[0]!;
        setSelectedSpouseRelId(rel.relationshipId);
        if (artifactType === ArtifactType.MARRIAGE_RECORD) {
          setMarriageDate(rel.metadata?.marriageDate || '');
          setMarriagePlace(rel.metadata?.marriagePlace || '');
        } else {
          setDivorceDate(rel.metadata?.divorceDate || '');
          setDivorcePlace(rel.metadata?.divorcePlace || '');
        }
      }
    }
  }, [artifactType]); // eslint-disable-line react-hooks/exhaustive-deps

  // For census/immigration: when date changes, rebuild suggestions
  function handleDateChange(newDate: string) {
    setRecordDate(newDate);
    if (
      artifactType === ArtifactType.CENSUS_RECORD ||
      artifactType === ArtifactType.IMMIGRATION_RECORD
    ) {
      buildAndSetSuggestions(artifactType, newDate);
    }
  }

  // Search for people
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const result = await api.listPeople({ search: searchQuery.trim(), limit: 10 });
      // Filter out people already selected and the current person
      setSearchResults(
        result.items.filter(
          (p: Person) => p.personId !== personId && !selectedPeople.has(p.personId),
        ),
      );
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function addPersonFromSearch(p: Person) {
    const ev: PersonEvidence = {
      id: p.personId,
      name: `${p.firstName} ${p.lastName}`,
      relationship: 'Added',
      birthDate: p.birthDate || '',
      birthDateQualifier: p.birthDateQualifier || '',
      deathDate: p.deathDate || '',
      deathDateQualifier: p.deathDateQualifier || '',
      burialPlace: p.burialPlace || '',
      isPrimary: false,
    };
    setSelectedPeople((prev) => new Map(prev).set(p.personId, ev));
    setSearchResults([]);
    setSearchQuery('');
    setShowOtherSearch(false);
  }

  // Build dropdown options: all tree people not already selected
  function getDropdownOptions(): { id: string; name: string; relationship: string }[] {
    const options: { id: string; name: string; relationship: string }[] = [];
    const parents = relationships.filter(
      (r) => r.relationshipType === 'PARENT_CHILD' && r.person2Id === personId,
    );
    const children = relationships.filter(
      (r) => r.relationshipType === 'PARENT_CHILD' && r.person1Id === personId,
    );
    const spouses = getSpouseRelationships();

    // For Census/Immigration: filter by alive at the selected date
    const dateFiltered =
      artifactType === ArtifactType.CENSUS_RECORD ||
      artifactType === ArtifactType.IMMIGRATION_RECORD;
    const filterYear = dateFiltered ? parseYear(recordDate) : null;

    const canAdd = (id: string) => {
      if (id === personId || selectedPeople.has(id)) return false;
      const info = relatedPeople[id];
      if (!info) return false;
      if (dateFiltered && filterYear && !isAliveAtYear(info, filterYear)) return false;
      return true;
    };

    // Parents, spouses, children
    for (const r of parents) {
      if (canAdd(r.person1Id))
        options.push({
          id: r.person1Id,
          name: relatedPeople[r.person1Id]!.name,
          relationship: 'Parent',
        });
    }
    for (const r of spouses) {
      const id = getSpouseId(r);
      if (canAdd(id)) options.push({ id, name: relatedPeople[id]!.name, relationship: 'Spouse' });
    }
    for (const r of children) {
      if (canAdd(r.person2Id))
        options.push({
          id: r.person2Id,
          name: relatedPeople[r.person2Id]!.name,
          relationship: 'Child',
        });
    }
    return options;
  }

  function handleDropdownAdd(value: string) {
    if (value === '__other__') {
      setShowOtherSearch(true);
      return;
    }
    if (!value) return;
    const info = relatedPeople[value];
    if (!info) return;
    // Determine relationship label
    const isSpouse = relationships.some(
      (r) => r.relationshipType === 'SPOUSE' && (r.person1Id === value || r.person2Id === value),
    );
    const isParent = relationships.some(
      (r) =>
        r.relationshipType === 'PARENT_CHILD' && r.person1Id === value && r.person2Id === personId,
    );
    const rel = isSpouse ? 'Spouse' : isParent ? 'Parent' : 'Child';
    const ev = makeEvidence(value, info.name, rel);
    setSelectedPeople((prev) => new Map(prev).set(value, ev));
  }

  function removePerson(id: string) {
    setSelectedPeople((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  function updateEvidence(id: string, field: keyof PersonEvidence, value: string | boolean) {
    setSelectedPeople((prev) => {
      const next = new Map(prev);
      const ev = next.get(id);
      if (ev) next.set(id, { ...ev, [field]: value });
      return next;
    });
  }

  // Spouse selector change (marriage record)
  function handleSpouseRelChange(relId: string) {
    setSelectedSpouseRelId(relId);
    const rel = relationships.find((r) => r.relationshipId === relId);
    if (rel) {
      if (artifactType === ArtifactType.DIVORCE_RECORD) {
        setDivorceDate(rel.metadata?.divorceDate || '');
        setDivorcePlace(rel.metadata?.divorcePlace || '');
      } else {
        setMarriageDate(rel.metadata?.marriageDate || '');
        setMarriagePlace(rel.metadata?.marriagePlace || '');
      }
    }
  }

  function getAcceptTypes(): string {
    return RECORD_TYPES.has(artifactType) || artifactType === ArtifactType.OTHER
      ? IMAGE_AND_PDF_ACCEPT
      : IMAGE_ACCEPT;
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    // Revoke previous preview URL to avoid memory leaks
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);

    if (file) {
      setSelectedFile(file);
      setUploadError(null);
      if (file.type.startsWith('image/')) {
        setFilePreviewUrl(URL.createObjectURL(file));
      } else {
        setFilePreviewUrl(null);
      }
    } else {
      setSelectedFile(null);
      setFilePreviewUrl(null);
    }
  }

  function clearFile() {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setSelectedFile(null);
    setFilePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleUpload() {
    if (!selectedFile) {
      setUploadError('Please select a file first.');
      return;
    }
    const file = selectedFile;

    const allAllowed = IMAGE_AND_PDF_ACCEPT.split(',');
    if (!allAllowed.includes(file.type)) {
      setUploadError('Only JPEG, PNG, WebP, and PDF files are allowed.');
      return;
    }
    // Photos and graves only accept images (no PDF)
    if (artifactType === ArtifactType.PHOTO || artifactType === ArtifactType.GRAVE) {
      if (!file.type.startsWith('image/')) {
        setUploadError('Only image files are allowed for this type.');
        return;
      }
    }
    if (file.size === 0) {
      setUploadError('File appears to be empty (0 bytes).');
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError('File must be under 5MB.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      // Step 1: Get presigned upload URL
      // Build metadata for type-specific fields
      const metadata: Record<string, string> = {};
      if (artifactType === ArtifactType.CENSUS_RECORD && censusLocation.trim()) {
        metadata.censusLocation = censusLocation.trim();
      }
      if (artifactType === ArtifactType.IMMIGRATION_RECORD) {
        if (shipName.trim()) metadata.shipName = shipName.trim();
        if (portOfArrival.trim()) metadata.portOfArrival = portOfArrival.trim();
      }

      const uploadData: Record<string, unknown> = {
        personId,
        artifactType,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
        caption: caption.trim() || undefined,
        source: source.trim() || undefined,
        date: recordDate.trim() || undefined,
        isPrimary: artifactType === ArtifactType.PHOTO ? isPrimary : false,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      };

      const { uploadUrl, s3Key } = await api.createArtifactUploadUrl(uploadData);

      // Step 2: Upload directly to S3
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!uploadRes.ok) throw new Error('Upload to storage failed');

      // Step 3: Confirm upload
      const artifact = await api.confirmArtifactUpload({ ...uploadData, s3Key });

      // Step 4: Associate selected people (exclude primary — already associated)
      // For marriage/divorce, associate only the selected spouse
      const peopleToAssociate: string[] = [];
      if (
        (artifactType === ArtifactType.MARRIAGE_RECORD ||
          artifactType === ArtifactType.DIVORCE_RECORD) &&
        selectedSpouseRelId
      ) {
        const rel = relationships.find((r) => r.relationshipId === selectedSpouseRelId);
        if (rel) {
          const spouseId = rel.person1Id === personId ? rel.person2Id : rel.person1Id;
          peopleToAssociate.push(spouseId);
        }
      } else {
        for (const id of selectedPeople.keys()) {
          if (id !== personId) peopleToAssociate.push(id);
        }
      }
      if (peopleToAssociate.length > 0) {
        await api.associateArtifact(artifact.artifactId, {
          sourcePersonId: personId,
          targetPersonIds: peopleToAssociate,
        });
      }

      // Step 5: Update person records for people whose dates changed
      let anyUpdated = false;

      for (const ev of selectedPeople.values()) {
        const updates: Record<string, unknown> = {};
        const orig = ev.isPrimary
          ? {
              birthDate: person.birthDate,
              birthDateQualifier: person.birthDateQualifier,
              deathDate: person.deathDate,
              deathDateQualifier: person.deathDateQualifier,
            }
          : relatedPeople[ev.id];

        // Check if birth date changed
        if (ev.birthDate && ev.birthDate !== (orig?.birthDate || '')) {
          updates.birthDate = ev.birthDate;
          if (ev.birthDateQualifier) updates.birthDateQualifier = ev.birthDateQualifier;
        }
        // Check if death date changed
        if (ev.deathDate && ev.deathDate !== (orig?.deathDate || '')) {
          updates.deathDate = ev.deathDate;
          if (ev.deathDateQualifier) updates.deathDateQualifier = ev.deathDateQualifier;
        }
        // Cemetery → burialPlace for grave artifacts
        if (artifactType === ArtifactType.GRAVE && cemeteryLocation.trim()) {
          updates.burialPlace = cemeteryLocation.trim();
        }

        if (Object.keys(updates).length > 0) {
          await api.updatePerson(ev.id, updates);
          anyUpdated = true;
        }
      }

      // Step 5b: Update birth/death date + place for birth/death records
      if (artifactType === ArtifactType.BIRTH_RECORD) {
        const birthUpdates: Record<string, unknown> = {};
        if (recordDate.trim() && recordDate.trim() !== (person.birthDate || '')) {
          birthUpdates.birthDate = recordDate.trim();
        }
        if (birthPlace.trim() !== (person.birthPlace || '')) {
          birthUpdates.birthPlace = birthPlace.trim();
        }
        if (Object.keys(birthUpdates).length > 0) {
          await api.updatePerson(personId, birthUpdates);
          anyUpdated = true;
        }
      }
      if (artifactType === ArtifactType.DEATH_RECORD) {
        const deathUpdates: Record<string, unknown> = {};
        if (recordDate.trim() && recordDate.trim() !== (person.deathDate || '')) {
          deathUpdates.deathDate = recordDate.trim();
        }
        if (deathPlace.trim() !== (person.deathPlace || '')) {
          deathUpdates.deathPlace = deathPlace.trim();
        }
        if (Object.keys(deathUpdates).length > 0) {
          await api.updatePerson(personId, deathUpdates);
          anyUpdated = true;
        }
      }

      // Update marriage/divorce relationship
      if (
        (artifactType === ArtifactType.MARRIAGE_RECORD ||
          artifactType === ArtifactType.DIVORCE_RECORD) &&
        selectedSpouseRelId
      ) {
        const relUpdates: Record<string, unknown> = {};
        if (artifactType === ArtifactType.MARRIAGE_RECORD) {
          if (marriageDate.trim()) relUpdates.marriageDate = marriageDate.trim();
          if (marriagePlace.trim()) relUpdates.marriagePlace = marriagePlace.trim();
        } else {
          if (divorceDate.trim()) relUpdates.divorceDate = divorceDate.trim();
          if (divorcePlace.trim()) relUpdates.divorcePlace = divorcePlace.trim();
        }
        if (Object.keys(relUpdates).length > 0) {
          await api.updateRelationship(selectedSpouseRelId, { metadata: relUpdates });
          anyUpdated = true;
        }
      }

      // Reset form
      setCaption('');
      setRecordDate('');
      setIsPrimary(false);
      setCemeteryLocation('');
      setCensusLocation('');
      setShipName('');
      setPortOfArrival('');
      setBirthPlace('');
      setDeathPlace('');
      setMarriageDate('');
      setMarriagePlace('');
      setDivorceDate('');
      setDivorcePlace('');
      setSelectedSpouseRelId('');
      setSelectedPeople(new Map());
      setShowOtherSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      clearFile();

      if ((isPrimary || anyUpdated) && onPersonUpdated) onPersonUpdated();
      await loadArtifacts();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function startEditing(artifact: ArtifactWithUrl) {
    // Populate all form state from the artifact
    setEditingArtifact(artifact);
    setArtifactType(artifact.artifactType as ArtifactType);
    setCaption(artifact.caption || '');
    setSource(artifact.source || '');
    setRecordDate(artifact.date || '');
    setIsPrimary(artifact.isPrimary || false);
    setUploadError(null);

    // Type-specific metadata fields
    setCensusLocation(artifact.metadata?.censusLocation || '');
    setShipName(artifact.metadata?.shipName || '');
    setPortOfArrival(artifact.metadata?.portOfArrival || '');

    // Person-specific fields from person data
    setCemeteryLocation(person.burialPlace || '');
    setBirthPlace(person.birthPlace || '');
    setDeathPlace(person.deathPlace || '');

    // Marriage/Divorce: find the spouse relationship
    if (artifact.artifactType === 'MARRIAGE_RECORD' || artifact.artifactType === 'DIVORCE_RECORD') {
      const spouses = getSpouseRelationships();
      if (spouses.length > 0) {
        const rel = spouses[0]!;
        setSelectedSpouseRelId(rel.relationshipId);
        if (artifact.artifactType === 'MARRIAGE_RECORD') {
          setMarriageDate(rel.metadata?.marriageDate || '');
          setMarriagePlace(rel.metadata?.marriagePlace || '');
        } else {
          setDivorceDate(rel.metadata?.divorceDate || '');
          setDivorcePlace(rel.metadata?.divorcePlace || '');
        }
      }
    } else {
      setSelectedSpouseRelId('');
      setMarriageDate('');
      setMarriagePlace('');
      setDivorceDate('');
      setDivorcePlace('');
    }

    // Load existing associations
    try {
      const { associations } = await api.getArtifactAssociations(artifact.artifactId, personId);
      const people = new Map<string, PersonEvidence>();
      for (const assoc of associations) {
        const isPrim = assoc.personId === personId;
        const info = relatedPeople[assoc.personId];
        if (isPrim) {
          people.set(assoc.personId, makeEvidence(assoc.personId, personName, 'Primary', true));
        } else if (info) {
          // Determine relationship label
          const isSpouse = relationships.some(
            (r) =>
              r.relationshipType === 'SPOUSE' &&
              (r.person1Id === assoc.personId || r.person2Id === assoc.personId),
          );
          const isParent = relationships.some(
            (r) =>
              r.relationshipType === 'PARENT_CHILD' &&
              r.person1Id === assoc.personId &&
              r.person2Id === personId,
          );
          const isChild = relationships.some(
            (r) =>
              r.relationshipType === 'PARENT_CHILD' &&
              r.person1Id === personId &&
              r.person2Id === assoc.personId,
          );
          const rel = isSpouse ? 'Spouse' : isParent ? 'Parent' : isChild ? 'Child' : 'Added';
          people.set(assoc.personId, makeEvidence(assoc.personId, assoc.name, rel));
        } else {
          people.set(assoc.personId, {
            id: assoc.personId,
            name: assoc.name,
            relationship: 'Added',
            birthDate: '',
            birthDateQualifier: '',
            deathDate: '',
            deathDateQualifier: '',
            burialPlace: '',
            isPrimary: false,
          });
        }
      }
      setSelectedPeople(people);
      setOriginalAssociations(new Set(associations.map((a) => a.personId)));
    } catch {
      // If associations fail to load, just show primary
      const people = new Map<string, PersonEvidence>();
      people.set(personId, makeEvidence(personId, personName, 'Primary', true));
      setSelectedPeople(people);
      setOriginalAssociations(new Set([personId]));
    }

    // Clear file state (not applicable for edit)
    clearFile();

    // Scroll to top of upload section
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditing() {
    setEditingArtifact(null);
    setEditSaving(false);
    // Reset form to defaults
    setArtifactType(ArtifactType.PHOTO);
    setCaption('');
    setRecordDate('');
    setIsPrimary(false);
    setCemeteryLocation('');
    setCensusLocation('');
    setShipName('');
    setPortOfArrival('');
    setBirthPlace('');
    setDeathPlace('');
    setMarriageDate('');
    setMarriagePlace('');
    setDivorceDate('');
    setDivorcePlace('');
    setSelectedSpouseRelId('');
    setSelectedPeople(new Map());
    setOriginalAssociations(new Set());
    setShowOtherSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    setUploadError(null);
    clearFile();
  }

  async function handleSaveEdit() {
    if (!editingArtifact) return;
    setEditSaving(true);
    setUploadError(null);

    try {
      const type = editingArtifact.artifactType as ArtifactType;

      // Build metadata
      const metadata: Record<string, string> = {};
      if (type === ArtifactType.CENSUS_RECORD && censusLocation.trim()) {
        metadata.censusLocation = censusLocation.trim();
      }
      if (type === ArtifactType.IMMIGRATION_RECORD) {
        if (shipName.trim()) metadata.shipName = shipName.trim();
        if (portOfArrival.trim()) metadata.portOfArrival = portOfArrival.trim();
      }

      // Update the artifact itself
      const updates: Record<string, unknown> = {
        caption: caption.trim() || '',
        source: source.trim() || '',
        date: recordDate.trim() || '',
        isPrimary: type === ArtifactType.PHOTO ? isPrimary : undefined,
        ...(Object.keys(metadata).length > 0 ? { metadata } : { metadata: {} }),
      };
      await api.updateArtifact(editingArtifact.artifactId, personId, updates);

      // Update person records based on type
      let anyUpdated = false;

      // Grave: cemetery location → burialPlace for all associated people
      if (type === ArtifactType.GRAVE && cemeteryLocation.trim()) {
        for (const ev of selectedPeople.values()) {
          const personUpdates: Record<string, unknown> = { burialPlace: cemeteryLocation.trim() };
          // Also update birth/death dates if changed
          const orig = ev.isPrimary
            ? { birthDate: person.birthDate, deathDate: person.deathDate }
            : relatedPeople[ev.id];
          if (ev.birthDate && ev.birthDate !== (orig?.birthDate || '')) {
            personUpdates.birthDate = ev.birthDate;
            if (ev.birthDateQualifier) personUpdates.birthDateQualifier = ev.birthDateQualifier;
          }
          if (ev.deathDate && ev.deathDate !== (orig?.deathDate || '')) {
            personUpdates.deathDate = ev.deathDate;
            if (ev.deathDateQualifier) personUpdates.deathDateQualifier = ev.deathDateQualifier;
          }
          if (Object.keys(personUpdates).length > 0) {
            await api.updatePerson(ev.id, personUpdates);
            anyUpdated = true;
          }
        }
      } else if (type === ArtifactType.GRAVE) {
        // Still update birth/death dates for grave people
        for (const ev of selectedPeople.values()) {
          const personUpdates: Record<string, unknown> = {};
          const orig = ev.isPrimary
            ? { birthDate: person.birthDate, deathDate: person.deathDate }
            : relatedPeople[ev.id];
          if (ev.birthDate && ev.birthDate !== (orig?.birthDate || '')) {
            personUpdates.birthDate = ev.birthDate;
            if (ev.birthDateQualifier) personUpdates.birthDateQualifier = ev.birthDateQualifier;
          }
          if (ev.deathDate && ev.deathDate !== (orig?.deathDate || '')) {
            personUpdates.deathDate = ev.deathDate;
            if (ev.deathDateQualifier) personUpdates.deathDateQualifier = ev.deathDateQualifier;
          }
          if (Object.keys(personUpdates).length > 0) {
            await api.updatePerson(ev.id, personUpdates);
            anyUpdated = true;
          }
        }
      }

      if (type === ArtifactType.BIRTH_RECORD) {
        const birthUpdates: Record<string, unknown> = {};
        if (recordDate.trim() && recordDate.trim() !== (person.birthDate || '')) {
          birthUpdates.birthDate = recordDate.trim();
        }
        if (birthPlace.trim() !== (person.birthPlace || '')) {
          birthUpdates.birthPlace = birthPlace.trim();
        }
        if (Object.keys(birthUpdates).length > 0) {
          await api.updatePerson(personId, birthUpdates);
          anyUpdated = true;
        }
      }

      if (type === ArtifactType.DEATH_RECORD) {
        const deathUpdates: Record<string, unknown> = {};
        if (recordDate.trim() && recordDate.trim() !== (person.deathDate || '')) {
          deathUpdates.deathDate = recordDate.trim();
        }
        if (deathPlace.trim() !== (person.deathPlace || '')) {
          deathUpdates.deathPlace = deathPlace.trim();
        }
        if (Object.keys(deathUpdates).length > 0) {
          await api.updatePerson(personId, deathUpdates);
          anyUpdated = true;
        }
      }

      // Marriage/Divorce relationship update
      if (
        (type === ArtifactType.MARRIAGE_RECORD || type === ArtifactType.DIVORCE_RECORD) &&
        selectedSpouseRelId
      ) {
        const relUpdates: Record<string, unknown> = {};
        if (type === ArtifactType.MARRIAGE_RECORD) {
          if (marriageDate.trim()) relUpdates.marriageDate = marriageDate.trim();
          if (marriagePlace.trim()) relUpdates.marriagePlace = marriagePlace.trim();
        } else {
          if (divorceDate.trim()) relUpdates.divorceDate = divorceDate.trim();
          if (divorcePlace.trim()) relUpdates.divorcePlace = divorcePlace.trim();
        }
        if (Object.keys(relUpdates).length > 0) {
          await api.updateRelationship(selectedSpouseRelId, { metadata: relUpdates });
          anyUpdated = true;
        }
      }

      // Handle association changes
      const currentIds = new Set(selectedPeople.keys());
      // Add new associations
      const toAdd = [...currentIds].filter(
        (id) => id !== personId && !originalAssociations.has(id),
      );
      if (toAdd.length > 0) {
        await api.associateArtifact(editingArtifact.artifactId, {
          sourcePersonId: personId,
          targetPersonIds: toAdd,
        });
      }
      // Remove old associations
      const toRemove = [...originalAssociations].filter(
        (id) => id !== personId && !currentIds.has(id),
      );
      for (const id of toRemove) {
        await api.disassociateArtifact(editingArtifact.artifactId, id);
      }

      cancelEditing();
      if ((isPrimary || anyUpdated) && onPersonUpdated) onPersonUpdated();
      await loadArtifacts();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(artifact: ArtifactWithUrl) {
    if (!confirm(`Delete "${artifact.fileName}"?`)) return;
    try {
      await api.deleteArtifact(artifact.artifactId, personId);
      await loadArtifacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete artifact');
    }
  }

  // Filter artifacts
  const filtered = artifacts.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'photos') return a.artifactType === 'PHOTO';
    if (filter === 'graves') return a.artifactType === 'GRAVE';
    if (filter === 'records') return RECORD_TYPES.has(a.artifactType as ArtifactType);
    return true;
  });

  if (loading) return <p className={styles.status}>Loading artifacts...</p>;
  if (error) return <p className={styles.error}>{error}</p>;

  return (
    <div className={styles.container}>
      {/* Upload section */}
      {canEdit && (
        <div className={styles.uploadSection}>
          <div className={styles.uploadTitleRow}>
            <h3 className={styles.uploadTitle}>
              {editingArtifact ? 'Edit Artifact' : 'Upload Artifact'}
            </h3>
            {editingArtifact && (
              <button
                type="button"
                className={styles.btnCancel}
                onClick={cancelEditing}
                disabled={editSaving}
              >
                Cancel
              </button>
            )}
          </div>
          {uploadError && <p className={styles.uploadError}>{uploadError}</p>}

          {/* File selection (upload mode only) */}
          {!editingArtifact && (
            <>
              {!selectedFile ? (
                <div className={styles.fileDropArea}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={IMAGE_AND_PDF_ACCEPT}
                    className={styles.fileInputHidden}
                    onChange={handleFileSelect}
                    disabled={uploading}
                    id="artifact-file-input"
                  />
                  <label htmlFor="artifact-file-input" className={styles.fileDropLabel}>
                    Choose a file (JPEG, PNG, WebP, or PDF)
                  </label>
                </div>
              ) : (
                <div className={styles.filePreviewArea}>
                  {filePreviewUrl ? (
                    <img src={filePreviewUrl} alt="Preview" className={styles.filePreviewImage} />
                  ) : (
                    <div className={styles.filePreviewPdf}>
                      <span className={styles.pdfIcon}>PDF</span>
                    </div>
                  )}
                  <div className={styles.filePreviewInfo}>
                    <span className={styles.filePreviewName}>{selectedFile.name}</span>
                    <span className={styles.filePreviewSize}>
                      {selectedFile.size < 1024 * 1024
                        ? `${(selectedFile.size / 1024).toFixed(0)} KB`
                        : `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`}
                    </span>
                    <button
                      type="button"
                      className={styles.filePreviewRemove}
                      onClick={clearFile}
                      disabled={uploading}
                    >
                      Change file
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Fields (shown after file selected in upload mode, or always in edit mode) */}
          {(selectedFile || editingArtifact) && (
            <>
              {/* Row: Type + Source */}
              <div className={styles.uploadRow}>
                <label className={styles.fieldLabel}>
                  Type
                  <select
                    className={styles.selectInput}
                    value={artifactType}
                    onChange={(e) => setArtifactType(e.target.value as ArtifactType)}
                    disabled={uploading || editSaving || !!editingArtifact}
                  >
                    {Object.values(ArtifactType)
                      .filter((t) => {
                        if (editingArtifact) return true;
                        // Hide image-only types when a PDF is selected
                        if (selectedFile?.type === 'application/pdf') {
                          return t !== ArtifactType.PHOTO && t !== ArtifactType.GRAVE;
                        }
                        return true;
                      })
                      .map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                  </select>
                </label>

                <label className={styles.fieldLabel}>
                  Source (person or url)
                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder="Name or https://..."
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    maxLength={500}
                    disabled={uploading || editSaving}
                  />
                </label>
              </div>

              {/* Type-specific fields */}
              {artifactType === ArtifactType.GRAVE && (
                <div className={styles.typeFields}>
                  <label className={styles.fieldLabel}>
                    Cemetery / Location
                    <input
                      type="text"
                      className={styles.textInput}
                      placeholder="Cemetery name and location"
                      value={cemeteryLocation}
                      onChange={(e) => setCemeteryLocation(e.target.value)}
                      disabled={uploading}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Inscription
                    <input
                      type="text"
                      className={styles.textInput}
                      placeholder="Text on the gravestone"
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      maxLength={500}
                      disabled={uploading}
                    />
                  </label>
                </div>
              )}

              {artifactType === ArtifactType.BIRTH_RECORD && (
                <div className={styles.typeFields}>
                  <label className={styles.fieldLabel}>
                    Birth Place
                    <input
                      type="text"
                      className={styles.textInput}
                      placeholder="City, County, State"
                      value={birthPlace}
                      onChange={(e) => setBirthPlace(e.target.value)}
                      disabled={uploading}
                    />
                  </label>
                </div>
              )}

              {artifactType === ArtifactType.DEATH_RECORD && (
                <div className={styles.typeFields}>
                  <label className={styles.fieldLabel}>
                    Death Place
                    <input
                      type="text"
                      className={styles.textInput}
                      placeholder="City, County, State"
                      value={deathPlace}
                      onChange={(e) => setDeathPlace(e.target.value)}
                      disabled={uploading}
                    />
                  </label>
                </div>
              )}

              {artifactType === ArtifactType.MARRIAGE_RECORD && (
                <div className={styles.typeFields}>
                  <label className={styles.fieldLabel}>
                    Spouse
                    <select
                      className={styles.selectInput}
                      value={selectedSpouseRelId}
                      onChange={(e) => handleSpouseRelChange(e.target.value)}
                      disabled={uploading}
                    >
                      {getSpouseRelationships().map((r) => {
                        const spouseId = getSpouseId(r);
                        return (
                          <option key={r.relationshipId} value={r.relationshipId}>
                            {relatedPeople[spouseId]?.name || spouseId}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label className={styles.fieldLabel}>
                    Marriage Date
                    <FlexDateInput
                      value={marriageDate}
                      onChange={(v) => setMarriageDate(v)}
                      disabled={uploading}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Marriage Place
                    <input
                      type="text"
                      className={styles.textInput}
                      placeholder="City, County, State"
                      value={marriagePlace}
                      onChange={(e) => setMarriagePlace(e.target.value)}
                      disabled={uploading}
                    />
                  </label>
                </div>
              )}

              {artifactType === ArtifactType.DIVORCE_RECORD && (
                <div className={styles.typeFields}>
                  <label className={styles.fieldLabel}>
                    Spouse
                    <select
                      className={styles.selectInput}
                      value={selectedSpouseRelId}
                      onChange={(e) => handleSpouseRelChange(e.target.value)}
                      disabled={uploading}
                    >
                      {getSpouseRelationships().map((r) => {
                        const spouseId = getSpouseId(r);
                        return (
                          <option key={r.relationshipId} value={r.relationshipId}>
                            {relatedPeople[spouseId]?.name || spouseId}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label className={styles.fieldLabel}>
                    Divorce Date
                    <FlexDateInput
                      value={divorceDate}
                      onChange={(v) => setDivorceDate(v)}
                      disabled={uploading}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Divorce Place
                    <input
                      type="text"
                      className={styles.textInput}
                      placeholder="City, County, State"
                      value={divorcePlace}
                      onChange={(e) => setDivorcePlace(e.target.value)}
                      disabled={uploading}
                    />
                  </label>
                </div>
              )}

              {artifactType === ArtifactType.CENSUS_RECORD && (
                <div className={styles.typeFields}>
                  <label className={styles.fieldLabel}>
                    Date
                    <FlexDateInput
                      value={recordDate}
                      onChange={handleDateChange}
                      disabled={uploading}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    District / Location
                    <input
                      type="text"
                      className={styles.textInput}
                      placeholder="Township, County, State"
                      value={censusLocation}
                      onChange={(e) => setCensusLocation(e.target.value)}
                      disabled={uploading}
                    />
                  </label>
                </div>
              )}

              {artifactType === ArtifactType.IMMIGRATION_RECORD && (
                <div className={styles.typeFields}>
                  <label className={styles.fieldLabel}>
                    Date
                    <FlexDateInput
                      value={recordDate}
                      onChange={handleDateChange}
                      disabled={uploading}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Ship Name
                    <input
                      type="text"
                      className={styles.textInput}
                      placeholder="e.g. SS Rotterdam"
                      value={shipName}
                      onChange={(e) => setShipName(e.target.value)}
                      disabled={uploading}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Port of Arrival
                    <input
                      type="text"
                      className={styles.textInput}
                      placeholder="e.g. New York"
                      value={portOfArrival}
                      onChange={(e) => setPortOfArrival(e.target.value)}
                      disabled={uploading}
                    />
                  </label>
                </div>
              )}

              {/* Generic date for BIRTH_RECORD and DEATH_RECORD */}
              {(artifactType === ArtifactType.BIRTH_RECORD ||
                artifactType === ArtifactType.DEATH_RECORD) && (
                <label className={styles.fieldLabel}>
                  Date
                  <FlexDateInput
                    value={recordDate}
                    onChange={(v) => setRecordDate(v)}
                    disabled={uploading}
                  />
                </label>
              )}

              {/* Caption for Photo and Other only */}
              {(artifactType === ArtifactType.PHOTO || artifactType === ArtifactType.OTHER) && (
                <input
                  type="text"
                  className={styles.textInput}
                  placeholder="Caption (optional)"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={500}
                  disabled={uploading}
                />
              )}

              {/* Photo-specific: profile photo checkbox */}
              {artifactType === ArtifactType.PHOTO && (
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={isPrimary}
                    onChange={(e) => setIsPrimary(e.target.checked)}
                    disabled={uploading}
                  />
                  Set as profile photo
                </label>
              )}

              {/* People Association Section */}
              {artifactType !== ArtifactType.BIRTH_RECORD &&
                artifactType !== ArtifactType.DEATH_RECORD &&
                artifactType !== ArtifactType.MARRIAGE_RECORD &&
                artifactType !== ArtifactType.DIVORCE_RECORD &&
                !(
                  (artifactType === ArtifactType.CENSUS_RECORD ||
                    artifactType === ArtifactType.IMMIGRATION_RECORD) &&
                  !recordDate
                ) && (
                  <div className={styles.associationSection}>
                    <span className={styles.associationTitle}>Associated People</span>

                    <div className={styles.personList}>
                      {Array.from(selectedPeople.values()).map((ev) => (
                        <div key={ev.id} className={styles.personCard}>
                          <div className={styles.personHeader}>
                            <div className={styles.personInfo}>
                              <span className={styles.personName}>{ev.name}</span>
                              <span className={styles.personLifespan}>
                                {formatLifespan(ev.birthDate, ev.deathDate)}
                              </span>
                            </div>
                            <div className={styles.personActions}>
                              <span className={styles.personRelLabel}>{ev.relationship}</span>
                              {!ev.isPrimary && (
                                <button
                                  type="button"
                                  className={styles.personRemove}
                                  onClick={() => removePerson(ev.id)}
                                  title="Remove"
                                >
                                  &times;
                                </button>
                              )}
                            </div>
                          </div>
                          {artifactType === ArtifactType.GRAVE && (
                            <div className={styles.personDates}>
                              <label className={styles.fieldLabel}>
                                Birth
                                <div className={styles.dateRow}>
                                  <select
                                    className={styles.selectInput}
                                    value={ev.birthDateQualifier}
                                    onChange={(e) =>
                                      updateEvidence(ev.id, 'birthDateQualifier', e.target.value)
                                    }
                                    disabled={uploading}
                                  >
                                    <option value="">Exact</option>
                                    <option value="ABT">About</option>
                                    <option value="BEF">Before</option>
                                    <option value="AFT">After</option>
                                  </select>
                                  <input
                                    type="text"
                                    className={styles.textInput}
                                    placeholder="YYYY or YYYY-MM-DD"
                                    value={ev.birthDate}
                                    onChange={(e) =>
                                      updateEvidence(ev.id, 'birthDate', e.target.value)
                                    }
                                    disabled={uploading}
                                  />
                                </div>
                              </label>
                              <label className={styles.fieldLabel}>
                                Death
                                <div className={styles.dateRow}>
                                  <select
                                    className={styles.selectInput}
                                    value={ev.deathDateQualifier}
                                    onChange={(e) =>
                                      updateEvidence(ev.id, 'deathDateQualifier', e.target.value)
                                    }
                                    disabled={uploading}
                                  >
                                    <option value="">Exact</option>
                                    <option value="ABT">About</option>
                                    <option value="BEF">Before</option>
                                    <option value="AFT">After</option>
                                  </select>
                                  <input
                                    type="text"
                                    className={styles.textInput}
                                    placeholder="YYYY or YYYY-MM-DD"
                                    value={ev.deathDate}
                                    onChange={(e) =>
                                      updateEvidence(ev.id, 'deathDate', e.target.value)
                                    }
                                    disabled={uploading}
                                  />
                                </div>
                              </label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Dropdown to add people */}
                    {(() => {
                      const opts = getDropdownOptions();
                      return (
                        <>
                          <select
                            className={styles.selectInput}
                            value=""
                            onChange={(e) => handleDropdownAdd(e.target.value)}
                            disabled={uploading}
                          >
                            <option value="">Add a person...</option>
                            {opts.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name} ({o.relationship})
                              </option>
                            ))}
                            <option value="__other__">Other (search)...</option>
                          </select>

                          {showOtherSearch && (
                            <>
                              <div className={styles.searchRow}>
                                <input
                                  type="text"
                                  className={styles.textInput}
                                  placeholder="Search by name..."
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                  disabled={uploading}
                                />
                                <button
                                  type="button"
                                  className={styles.btnSearch}
                                  onClick={handleSearch}
                                  disabled={uploading || searching}
                                >
                                  {searching ? '...' : 'Search'}
                                </button>
                              </div>
                              {searchResults.length > 0 && (
                                <div className={styles.searchResults}>
                                  {searchResults.map((p) => (
                                    <button
                                      key={p.personId}
                                      type="button"
                                      className={styles.searchResultItem}
                                      onClick={() => addPersonFromSearch(p)}
                                    >
                                      {p.firstName} {p.lastName}
                                      {p.birthDate ? ` (${p.birthDate})` : ''}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

              {editingArtifact ? (
                <button
                  type="button"
                  className={styles.btnUpload}
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                >
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.btnUpload}
                  onClick={handleUpload}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Filter tabs */}
      {artifacts.length > 0 && (
        <div className={styles.filterTabs}>
          {(
            [
              ['all', 'All'],
              ['graves', 'Grave'],
              ['records', 'Records'],
              ['photos', 'Photos'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`${styles.filterTab} ${filter === key ? styles.filterTabActive : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Gallery grid */}
      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {artifacts.length === 0 ? 'No artifacts yet.' : 'No artifacts match this filter.'}
        </p>
      ) : (
        <div className={styles.grid}>
          {filtered.map((artifact) => (
            <div key={`${artifact.artifactId}-${artifact.personId}`} className={styles.card}>
              {artifact.contentType === 'application/pdf' ? (
                <div
                  className={styles.pdfPlaceholder}
                  onClick={async () => {
                    try {
                      const { url } = await api.getArtifactUrl(artifact.artifactId, personId);
                      window.open(url, '_blank');
                    } catch {
                      // ignore
                    }
                  }}
                >
                  <span className={styles.pdfIcon}>PDF</span>
                  <span className={styles.pdfLabel}>
                    {TYPE_LABELS[artifact.artifactType] || 'Document'}
                  </span>
                </div>
              ) : artifact.viewUrl ? (
                <img
                  src={artifact.viewUrl}
                  alt={artifact.caption || artifact.fileName}
                  className={styles.image}
                  loading="lazy"
                  onClick={() => openLightbox(artifact)}
                  style={{ cursor: 'pointer' }}
                />
              ) : (
                <div className={styles.imagePlaceholder}>Unable to load</div>
              )}
              <div className={styles.cardInfo}>
                <span
                  className={`${styles.typeBadge} ${styles[TYPE_BADGE_CLASS[artifact.artifactType] || 'badgeOther']}`}
                >
                  {TYPE_LABELS[artifact.artifactType] || artifact.artifactType}
                </span>
                {artifact.caption && <p className={styles.caption}>{artifact.caption}</p>}
                {artifact.metadata?.censusLocation && (
                  <p className={styles.date}>Location: {artifact.metadata.censusLocation}</p>
                )}
                {artifact.metadata?.shipName && (
                  <p className={styles.date}>Ship: {artifact.metadata.shipName}</p>
                )}
                {artifact.metadata?.portOfArrival && (
                  <p className={styles.date}>Port: {artifact.metadata.portOfArrival}</p>
                )}
                {artifact.source &&
                  (() => {
                    const { text, href } = formatSource(artifact.source!);
                    return (
                      <p className={styles.source}>
                        Source:{' '}
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer">
                            {text}
                          </a>
                        ) : (
                          text
                        )}
                      </p>
                    );
                  })()}
                {artifact.date && <p className={styles.date}>Date: {artifact.date}</p>}
                {artifact.isPrimary && <span className={styles.primaryBadge}>Profile Photo</span>}
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.btnDownload}
                    onClick={async () => {
                      try {
                        const { url } = await api.getArtifactUrl(artifact.artifactId, personId);
                        const res = await fetch(url);
                        const blob = await res.blob();
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = artifact.fileName;
                        a.click();
                        URL.revokeObjectURL(a.href);
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    Download
                  </button>
                  {(user?.role === 'admins' || artifact.uploadedBy === user?.userId) && (
                    <>
                      <button
                        type="button"
                        className={styles.btnEdit}
                        onClick={() => startEditing(artifact)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.btnDelete}
                        onClick={() => handleDelete(artifact)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox overlay */}
      {lightboxArtifact &&
        lightboxArtifact.viewUrl &&
        (() => {
          const lbType = lightboxArtifact.artifactType as ArtifactType;
          const lbSource = lightboxArtifact.source ? formatSource(lightboxArtifact.source) : null;

          // Find marriage/divorce metadata from relationships
          let spouseRelMeta: RelationshipMetadata | undefined;
          if (lbType === ArtifactType.MARRIAGE_RECORD || lbType === ArtifactType.DIVORCE_RECORD) {
            const spouseAssoc = lightboxAssociations.find((a) => a.personId !== personId);
            if (spouseAssoc) {
              const rel = relationships.find(
                (r) =>
                  r.relationshipType === 'SPOUSE' &&
                  (r.person1Id === spouseAssoc.personId || r.person2Id === spouseAssoc.personId),
              );
              spouseRelMeta = rel?.metadata;
            }
          }

          return (
            <div className={styles.lightboxOverlay} onClick={closeLightbox}>
              <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
                <button type="button" className={styles.lightboxClose} onClick={closeLightbox}>
                  &times;
                </button>

                <div className={styles.lightboxImageContainer}>
                  <img
                    src={lightboxArtifact.viewUrl}
                    alt={lightboxArtifact.caption || lightboxArtifact.fileName}
                    className={styles.lightboxImage}
                  />
                </div>

                <div className={styles.lightboxDetails}>
                  {/* Type badge */}
                  <span
                    className={`${styles.typeBadge} ${styles[TYPE_BADGE_CLASS[lightboxArtifact.artifactType] || 'badgeOther']}`}
                  >
                    {TYPE_LABELS[lightboxArtifact.artifactType] || lightboxArtifact.artifactType}
                  </span>

                  {/* Caption / Inscription */}
                  {lightboxArtifact.caption && (
                    <div className={styles.lightboxDetailRow}>
                      <span className={styles.lightboxDetailLabel}>
                        {lbType === ArtifactType.GRAVE ? 'Inscription' : 'Caption'}
                      </span>
                      <p className={styles.lightboxDetailValue}>{lightboxArtifact.caption}</p>
                    </div>
                  )}

                  {/* Source */}
                  {lbSource && (
                    <div className={styles.lightboxDetailRow}>
                      <span className={styles.lightboxDetailLabel}>Source</span>
                      <p className={styles.lightboxDetailValue}>
                        {lbSource.href ? (
                          <a href={lbSource.href} target="_blank" rel="noopener noreferrer">
                            {lbSource.text}
                          </a>
                        ) : (
                          lbSource.text
                        )}
                      </p>
                    </div>
                  )}

                  {/* Date */}
                  {lightboxArtifact.date && (
                    <div className={styles.lightboxDetailRow}>
                      <span className={styles.lightboxDetailLabel}>Date</span>
                      <p className={styles.lightboxDetailValue}>{lightboxArtifact.date}</p>
                    </div>
                  )}

                  {/* Type-specific metadata */}
                  {lbType === ArtifactType.GRAVE && person.burialPlace && (
                    <div className={styles.lightboxDetailRow}>
                      <span className={styles.lightboxDetailLabel}>Cemetery / Location</span>
                      <p className={styles.lightboxDetailValue}>{person.burialPlace}</p>
                    </div>
                  )}
                  {lbType === ArtifactType.BIRTH_RECORD && person.birthPlace && (
                    <div className={styles.lightboxDetailRow}>
                      <span className={styles.lightboxDetailLabel}>Birth Place</span>
                      <p className={styles.lightboxDetailValue}>{person.birthPlace}</p>
                    </div>
                  )}
                  {lbType === ArtifactType.DEATH_RECORD && person.deathPlace && (
                    <div className={styles.lightboxDetailRow}>
                      <span className={styles.lightboxDetailLabel}>Death Place</span>
                      <p className={styles.lightboxDetailValue}>{person.deathPlace}</p>
                    </div>
                  )}
                  {lbType === ArtifactType.CENSUS_RECORD &&
                    lightboxArtifact.metadata?.censusLocation && (
                      <div className={styles.lightboxDetailRow}>
                        <span className={styles.lightboxDetailLabel}>Location</span>
                        <p className={styles.lightboxDetailValue}>
                          {lightboxArtifact.metadata.censusLocation}
                        </p>
                      </div>
                    )}
                  {lbType === ArtifactType.IMMIGRATION_RECORD &&
                    lightboxArtifact.metadata?.shipName && (
                      <div className={styles.lightboxDetailRow}>
                        <span className={styles.lightboxDetailLabel}>Ship</span>
                        <p className={styles.lightboxDetailValue}>
                          {lightboxArtifact.metadata.shipName}
                        </p>
                      </div>
                    )}
                  {lbType === ArtifactType.IMMIGRATION_RECORD &&
                    lightboxArtifact.metadata?.portOfArrival && (
                      <div className={styles.lightboxDetailRow}>
                        <span className={styles.lightboxDetailLabel}>Port of Arrival</span>
                        <p className={styles.lightboxDetailValue}>
                          {lightboxArtifact.metadata.portOfArrival}
                        </p>
                      </div>
                    )}
                  {lbType === ArtifactType.MARRIAGE_RECORD && spouseRelMeta && (
                    <>
                      {spouseRelMeta.marriageDate && (
                        <div className={styles.lightboxDetailRow}>
                          <span className={styles.lightboxDetailLabel}>Marriage Date</span>
                          <p className={styles.lightboxDetailValue}>{spouseRelMeta.marriageDate}</p>
                        </div>
                      )}
                      {spouseRelMeta.marriagePlace && (
                        <div className={styles.lightboxDetailRow}>
                          <span className={styles.lightboxDetailLabel}>Marriage Place</span>
                          <p className={styles.lightboxDetailValue}>
                            {spouseRelMeta.marriagePlace}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  {lbType === ArtifactType.DIVORCE_RECORD && spouseRelMeta && (
                    <>
                      {spouseRelMeta.divorceDate && (
                        <div className={styles.lightboxDetailRow}>
                          <span className={styles.lightboxDetailLabel}>Divorce Date</span>
                          <p className={styles.lightboxDetailValue}>{spouseRelMeta.divorceDate}</p>
                        </div>
                      )}
                      {spouseRelMeta.divorcePlace && (
                        <div className={styles.lightboxDetailRow}>
                          <span className={styles.lightboxDetailLabel}>Divorce Place</span>
                          <p className={styles.lightboxDetailValue}>{spouseRelMeta.divorcePlace}</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Profile photo badge */}
                  {lightboxArtifact.isPrimary && (
                    <span className={styles.lightboxPrimaryBadge}>Profile Photo</span>
                  )}

                  {/* Associated people */}
                  {(lightboxAssocLoading || lightboxAssociations.length > 0) && (
                    <div className={styles.lightboxPeopleSection}>
                      <span className={styles.lightboxDetailLabel}>People</span>
                      {lightboxAssocLoading ? (
                        <span className={styles.lightboxLoading}>Loading...</span>
                      ) : (
                        lightboxAssociations.map((assoc) => {
                          const isGrave = lbType === ArtifactType.GRAVE;
                          const pInfo =
                            assoc.personId === personId
                              ? { birthDate: person.birthDate, deathDate: person.deathDate }
                              : relatedPeople[assoc.personId];
                          const lifespan = pInfo
                            ? formatLifespan(pInfo.birthDate, pInfo.deathDate)
                            : '';
                          return (
                            <Link
                              key={assoc.personId}
                              href={`/people/${assoc.personId}`}
                              className={styles.lightboxPersonLink}
                              onClick={closeLightbox}
                            >
                              <span>{assoc.name}</span>
                              {(isGrave || lifespan) && (
                                <span className={styles.lightboxPersonLifespan}>{lifespan}</span>
                              )}
                            </Link>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className={styles.lightboxActions}>
                    <button
                      type="button"
                      className={styles.btnDownload}
                      onClick={async () => {
                        try {
                          const { url } = await api.getArtifactUrl(
                            lightboxArtifact.artifactId,
                            personId,
                          );
                          const res = await fetch(url);
                          const blob = await res.blob();
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(blob);
                          a.download = lightboxArtifact.fileName;
                          a.click();
                          URL.revokeObjectURL(a.href);
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      Download
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        className={styles.btnEdit}
                        onClick={() => {
                          startEditing(lightboxArtifact);
                          closeLightbox();
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
