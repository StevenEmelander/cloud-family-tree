import { PutObjectCommand } from '@aws-sdk/client-s3';
import type {
  AlternateName,
  Artifact,
  Citation,
  GedcomImportResult,
  Person,
  PersonEvent,
  Relationship,
  Source,
} from '@cloud-family-tree/shared';
import { ARTIFACT_TYPE_TO_EVENT_TAG, ArtifactType, DateQualifier, Gender, RelationshipType, isoNow } from '@cloud-family-tree/shared';
import { v4 as uuid } from 'uuid';
import { BucketNames, s3Client } from '../lib/s3';
import type { GedzipMetadata } from './gedcom7/gedzip';
import { ArtifactRepository } from '../repositories/artifact.repository';
import { EntryRepository } from '../repositories/entry.repository';
import { PersonRepository } from '../repositories/person.repository';
import { RelationshipRepository } from '../repositories/relationship.repository';
import { SourceRepository } from '../repositories/source.repository';
import {
  childValue,
  findChild,
  findChildren,
  getRecordsByTag,
  parseGedcom,
} from './gedcom7/parser';
import type { GedcomNode } from './gedcom7/types';

// ── Date parsing ──

interface ParsedDate {
  date: string | undefined;
  qualifier?: DateQualifier;
  warning?: string;
}

const GEDCOM_QUALIFIER_MAP: Record<string, DateQualifier> = {
  ABT: DateQualifier.ABT,
  AFT: DateQualifier.AFT,
  BEF: DateQualifier.BEF,
  EST: DateQualifier.EST,
  CAL: DateQualifier.CAL,
};

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

function parseGedcomDate(dateStr: string | undefined): ParsedDate {
  if (!dateStr) return { date: undefined };

  const prefixMatch = dateStr.match(/^(ABT|AFT|BEF|EST|CAL|FROM|TO|INT)\s+/i);
  const qualifier = prefixMatch ? (prefixMatch[1] ?? '').toUpperCase() : undefined;
  const cleaned = qualifier
    ? dateStr.slice((prefixMatch?.[0] ?? '').length).trim()
    : dateStr.trim();
  if (!cleaned) return { date: undefined };

  let parsed: string | undefined;

  // Full date: 15 MAR 1960
  const fullMatch = cleaned.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/);
  if (fullMatch) {
    const month = MONTHS[fullMatch[2] ?? ''];
    if (month) parsed = `${fullMatch[3]}-${month}-${(fullMatch[1] ?? '').padStart(2, '0')}`;
  }
  // Month + year: SEP 1883
  if (!parsed) {
    const monthYearMatch = cleaned.match(/^([A-Z]{3})\s+(\d{4})$/);
    if (monthYearMatch) {
      const month = MONTHS[monthYearMatch[1] ?? ''];
      if (month) parsed = `${monthYearMatch[2]}-${month}`;
    }
  }
  // Year only: 1715
  if (!parsed) {
    const yearMatch = cleaned.match(/^(\d{4})$/);
    if (yearMatch) parsed = yearMatch[1] ?? '';
  }

  if (!parsed) return { date: undefined };

  // Validate semantically
  const parts = parsed.split('-').map(Number);
  if (parts.length === 3) {
    const [y, m, d] = parts;
    const dateObj = new Date(y ?? 0, (m ?? 0) - 1, d);
    if (dateObj.getFullYear() !== (y ?? 0) || dateObj.getMonth() !== (m ?? 0) - 1 || dateObj.getDate() !== d) {
      return { date: undefined, warning: `Invalid date in GEDCOM: "${dateStr}"` };
    }
  } else if (parts.length === 2) {
    if ((parts[1] ?? 0) < 1 || (parts[1] ?? 0) > 12) {
      return { date: undefined, warning: `Invalid date in GEDCOM: "${dateStr}"` };
    }
  }

  const mappedQualifier = qualifier ? GEDCOM_QUALIFIER_MAP[qualifier] : undefined;
  const warnings: string[] = [];
  if (qualifier && !mappedQualifier) {
    warnings.push(`Date qualifier "${qualifier}" not supported, stripped from "${dateStr}"`);
  }

  return {
    date: parsed,
    qualifier: mappedQualifier,
    warning: warnings.length > 0 ? warnings.join('; ') : undefined,
  };
}

// ── Helpers ──

function mapGender(sex: string | undefined): Gender {
  switch (sex?.toUpperCase()) {
    case 'M': return Gender.MALE;
    case 'F': return Gender.FEMALE;
    case 'X': return Gender.OTHER;
    default: return Gender.UNKNOWN;
  }
}

function truncate(str: string, max: number, label: string, warnings: string[]): string {
  if (str.length <= max) return str;
  warnings.push(`${label} truncated from ${str.length} to ${max} characters`);
  return str.slice(0, max);
}

function personMatchKey(firstName: string, lastName: string, middleName?: string, birthDate?: string): string {
  return `${firstName.toUpperCase()}|${(middleName || '').toUpperCase()}|${lastName.toUpperCase()}|${birthDate || ''}`;
}

// GEDCOM event tags that map to dedicated Person fields
const DEDICATED_EVENTS = new Set(['BIRT', 'DEAT', 'BURI']);

// Well-known GEDCOM individual event/attribute tags
const KNOWN_EVENT_TAGS = new Set([
  'CHR', 'CREM', 'ADOP', 'BAPM', 'BARM', 'BASM', 'CONF', 'FCOM',
  'NATU', 'EMIG', 'IMMI', 'CENS', 'PROB', 'WILL', 'GRAD', 'RETI',
  'RESI', 'OCCU', 'EDUC', 'RELI', 'EVEN', 'FACT',
  'DSCR', 'NATI', 'TITL', 'MILI', 'ORDN',
]);

// Map GEDCOM FORM (MIME type) to content type
function formToContentType(form: string | undefined): string {
  if (!form) return 'application/octet-stream';
  const lower = form.toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'image/jpeg',
    'image/png': 'image/png',
    'image/webp': 'image/webp',
    'application/pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'pdf': 'application/pdf',
  };
  return map[lower] ?? 'application/octet-stream';
}

// Map GEDCOM MEDI tag to ArtifactType
function mediToArtifactType(medi: string | undefined): ArtifactType {
  switch (medi?.toLowerCase()) {
    case 'photo': return ArtifactType.PHOTO;
    case 'tombstone': return ArtifactType.GRAVE;
    default: return ArtifactType.OTHER;
  }
}

// ── Import Service ──

export class GedcomImportService {
  private readonly personRepo = new PersonRepository();
  private readonly relationshipRepo = new RelationshipRepository();
  private readonly sourceRepo = new SourceRepository();
  private readonly artifactRepo = new ArtifactRepository();
  private readonly entryRepo = new EntryRepository();

  async import(
    gedcomContent: string,
    mediaFiles?: Map<string, Buffer>,
    metadata?: GedzipMetadata,
  ): Promise<GedcomImportResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const now = isoNow();

    const tree = parseGedcom(gedcomContent);

    // ── Validate GEDCOM 7 version ──
    if (tree.header) {
      const gedcNode = findChild(tree.header, 'GEDC');
      const version = gedcNode ? childValue(gedcNode, 'VERS') : undefined;
      if (!version || !version.startsWith('7')) {
        errors.push(
          `Unsupported GEDCOM version "${version ?? 'unknown'}". Only GEDCOM 7.x is supported. ` +
          'Please convert your file to GEDCOM 7 before importing.',
        );
        return {
          peopleAdded: 0,
          peopleSkipped: 0,
          peopleUpdated: 0,
          relationshipsAdded: 0,
          relationshipsSkipped: 0,
          sourcesAdded: 0,
          sourcesSkipped: 0,
          artifactsAdded: 0,
          artifactsSkipped: 0,
          errors,
          warnings,
        };
      }
    }

    // ── Phase 1: Parse and deduplicate SOUR records ──
    const existingSources: Source[] = [];
    for await (const batch of this.sourceRepo.iterateAll()) {
      existingSources.push(...batch);
    }
    const existingSourceGedcomIds = new Map<string, Source>();
    for (const s of existingSources) {
      if (s.gedcomId) existingSourceGedcomIds.set(s.gedcomId, s);
    }

    const sourceIdMap = new Map<string, string>(); // GEDCOM pointer → sourceId
    const newSources: Source[] = [];
    let sourcesSkipped = 0;

    // Pre-parse REPO records so SOUR can resolve repository pointers
    const importRepoRecords = new Map<string, { name: string; url?: string }>();
    for (const node of getRecordsByTag(tree, 'REPO')) {
      if (!node.xref) continue;
      const addrNode = findChild(node, 'ADDR');
      const url = addrNode ? childValue(addrNode, 'WWW') : childValue(node, 'WWW');
      importRepoRecords.set(node.xref, {
        name: childValue(node, 'NAME') ?? '',
        url,
      });
    }

    for (const node of getRecordsByTag(tree, 'SOUR')) {
      const pointer = node.xref;
      if (!pointer) continue;

      const existing = existingSourceGedcomIds.get(pointer);
      if (existing) {
        sourceIdMap.set(pointer, existing.sourceId);
        sourcesSkipped++;
        continue;
      }

      const repoNode = findChild(node, 'REPO');
      let repositoryName: string | undefined;
      let url: string | undefined;
      if (repoNode?.value && importRepoRecords.has(repoNode.value)) {
        const repo = importRepoRecords.get(repoNode.value)!;
        repositoryName = repo.name;
        url = repo.url;
      }
      // Also check for standalone WWW/NOTE with URL on the SOUR itself
      if (!url) url = childValue(node, 'WWW');

      // Extract URL from PUBL field if no explicit URL found
      const publ = childValue(node, 'PUBL');
      let publicationInfo = publ;
      if (!url && publ) {
        const urlMatch = publ.match(/(https?:\/\/\S+)/);
        if (urlMatch) {
          const extractedUrl = urlMatch[0];
          url = extractedUrl;
          // Strip the URL from publicationInfo, clean up trailing/leading separators
          publicationInfo = publ.replace(extractedUrl, '').replace(/,\s*$/, '').replace(/^\s*,\s*/, '').trim() || undefined;
        }
      }

      const source: Source = {
        sourceId: uuid(),
        title: childValue(node, 'TITL') ?? 'Untitled Source',
        author: childValue(node, 'AUTH'),
        publicationInfo,
        repositoryName,
        url,
        notes: childValue(node, 'NOTE'),
        gedcomId: pointer,
        createdAt: now,
        updatedAt: now,
      };
      sourceIdMap.set(pointer, source.sourceId);
      newSources.push(source);
    }

    // ── Phase 2: Parse INDI records ──
    const personIdMap = new Map<string, string>(); // GEDCOM pointer → personId
    const parsedPeople: { pointer: string; person: Person }[] = [];
    // Pending OBJE references found under events (resolved after artifacts are created)
    const pendingEventObjeLinks: { pointer: string; eventIndex: number; objePointer: string }[] = [];

    for (const node of getRecordsByTag(tree, 'INDI')) {
      try {
        const pointer = node.xref;
        if (!pointer) continue;

        // Parse primary name
        const nameNode = findChild(node, 'NAME');
        const nameValue = nameNode?.value ?? '';
        const nameParts = nameValue.split('/').map((s: string) => s.trim());
        const givenNames = nameParts[0] || 'Unknown';
        const lastName = nameParts[1] || 'Unknown';
        const spaceIdx = givenNames.indexOf(' ');
        let firstName = spaceIdx > 0 ? givenNames.slice(0, spaceIdx) : givenNames;
        let middleName = spaceIdx > 0 ? givenNames.slice(spaceIdx + 1) : undefined;
        let lastNameTrimmed = lastName;

        firstName = truncate(firstName, 100, `${pointer} firstName`, warnings);
        if (middleName) middleName = truncate(middleName, 100, `${pointer} middleName`, warnings);
        lastNameTrimmed = truncate(lastNameTrimmed, 100, `${pointer} lastName`, warnings);

        // Name details
        const suffix = nameNode ? childValue(nameNode, 'NSFX') : undefined;
        const prefix = nameNode ? childValue(nameNode, 'NPFX') : undefined;
        const nickname = nameNode ? childValue(nameNode, 'NICK') : undefined;

        // Alternate names
        const alternateNames: AlternateName[] = [];
        const allNames = findChildren(node, 'NAME');
        for (let i = 1; i < allNames.length; i++) {
          const altNode = allNames[i] as GedcomNode;
          const altType = childValue(altNode, 'TYPE') ?? 'AKA';
          const altNameVal = altNode.value ?? '';
          const altParts = altNameVal.split('/').map((s: string) => s.trim());
          const altGiven = altParts[0] || '';
          const altLast = altParts[1] || '';
          const altSpaceIdx = altGiven.indexOf(' ');

          alternateNames.push({
            type: altType as AlternateName['type'],
            firstName: altSpaceIdx > 0 ? altGiven.slice(0, altSpaceIdx) : altGiven || undefined,
            middleName: altSpaceIdx > 0 ? altGiven.slice(altSpaceIdx + 1) : undefined,
            lastName: altLast || undefined,
            suffix: childValue(altNode, 'NSFX'),
            prefix: childValue(altNode, 'NPFX'),
          });
        }

        const sex = childValue(node, 'SEX');

        // Parse dedicated events
        const birthNode = findChild(node, 'BIRT');
        const deathNode = findChild(node, 'DEAT');
        const buriNode = findChild(node, 'BURI');

        const birthDateResult = parseGedcomDate(birthNode ? childValue(birthNode, 'DATE') : undefined);
        const deathDateResult = parseGedcomDate(deathNode ? childValue(deathNode, 'DATE') : undefined);
        if (birthDateResult.warning) warnings.push(`${pointer}: ${birthDateResult.warning}`);
        if (deathDateResult.warning) warnings.push(`${pointer}: ${deathDateResult.warning}`);

        let birthPlace = birthNode ? childValue(birthNode, 'PLAC') : undefined;
        let deathPlace = deathNode ? childValue(deathNode, 'PLAC') : undefined;
        let burialPlace = buriNode ? childValue(buriNode, 'PLAC') : undefined;
        if (birthPlace) birthPlace = truncate(birthPlace, 200, `${pointer} birthPlace`, warnings);
        if (deathPlace) deathPlace = truncate(deathPlace, 200, `${pointer} deathPlace`, warnings);
        if (burialPlace) burialPlace = truncate(burialPlace, 200, `${pointer} burialPlace`, warnings);

        // Parse NOTE as biography
        let biography: string | undefined;
        const noteNode = findChild(node, 'NOTE');
        if (noteNode?.value) {
          biography = truncate(noteNode.value, 5000, `${pointer} biography`, warnings);
        }

        // Parse citations from SOUR references on events
        const citations: Citation[] = [];
        const eventTypeCount: Record<string, number> = {};
        const collectCitations = (eventNode: GedcomNode | undefined, eventType: string, eventIndex?: number) => {
          if (!eventNode) return;
          for (const sourRef of findChildren(eventNode, 'SOUR')) {
            if (!sourRef.value) continue;
            const srcId = sourceIdMap.get(sourRef.value);
            if (srcId) {
              const dataNode = findChild(sourRef, 'DATA');
              const detail = dataNode ? childValue(dataNode, 'TEXT') : undefined;
              citations.push({
                sourceId: srcId,
                eventType,
                ...(eventIndex !== undefined && { eventIndex }),
                page: childValue(sourRef, 'PAGE'),
                detail,
              });
            }
          }
        };
        collectCitations(birthNode, 'BIRT');
        collectCitations(deathNode, 'DEAT');
        collectCitations(buriNode, 'BURI');

        // Parse additional events
        const events: PersonEvent[] = [];
        for (const child of node.children) {
          if (DEDICATED_EVENTS.has(child.tag) || !KNOWN_EVENT_TAGS.has(child.tag)) continue;
          const evtDate = parseGedcomDate(childValue(child, 'DATE'));
          if (evtDate.warning) warnings.push(`${pointer}: ${evtDate.warning}`);
          events.push({
            type: child.tag,
            date: evtDate.date,
            dateQualifier: evtDate.qualifier,
            place: childValue(child, 'PLAC'),
            detail: child.value,
          });
          // Track index for events with repeated types (e.g. multiple OCCU)
          const idx = (eventTypeCount[child.tag] ?? 0);
          eventTypeCount[child.tag] = idx + 1;
          // Capture SOUR references nested under this event
          collectCitations(child, child.tag, idx);
          // Capture OBJE references nested under this event
          for (const objeRef of findChildren(child, 'OBJE')) {
            if (objeRef.value) {
              pendingEventObjeLinks.push({
                pointer,
                eventIndex: events.length - 1,
                objePointer: objeRef.value,
              });
            }
          }
        }
        // Top-level SOUR references
        for (const sourRef of findChildren(node, 'SOUR')) {
          if (!sourRef.value) continue;
          const srcId = sourceIdMap.get(sourRef.value);
          if (srcId) {
            const dataNode = findChild(sourRef, 'DATA');
            const detail = dataNode ? childValue(dataNode, 'TEXT') : undefined;
            citations.push({
              sourceId: srcId,
              eventType: 'GENERAL',
              page: childValue(sourRef, 'PAGE'),
              detail,
            });
          }
        }

        parsedPeople.push({
          pointer,
          person: {
            personId: uuid(),
            firstName,
            middleName,
            lastName: lastNameTrimmed,
            gender: mapGender(sex),
            birthDate: birthDateResult.date,
            birthDateQualifier: birthDateResult.qualifier,
            birthPlace,
            deathDate: deathDateResult.date,
            deathDateQualifier: deathDateResult.qualifier,
            deathPlace,
            burialPlace,
            biography,
            suffix,
            prefix,
            nickname,
            alternateNames: alternateNames.length > 0 ? alternateNames : undefined,
            events: events.length > 0 ? events : undefined,
            citations: citations.length > 0 ? citations : undefined,
            gedcomId: pointer,
            createdAt: now,
            updatedAt: now,
          },
        });
      } catch (err) {
        console.error('GEDCOM parse person error:', err);
        errors.push('Failed to parse person: invalid data');
      }
    }

    // ── Phase 3: Deduplicate people against existing DB ──
    const existingPeople: Person[] = [];
    for await (const batch of this.personRepo.iterateAll()) {
      existingPeople.push(...batch);
    }

    const gedcomIdIndex = new Map<string, Person>();
    const matchIndex = new Map<string, Person[]>();
    for (const existing of existingPeople) {
      if (existing.gedcomId) gedcomIdIndex.set(existing.gedcomId, existing);
      const key = personMatchKey(existing.firstName, existing.lastName, existing.middleName, existing.birthDate);
      const arr = matchIndex.get(key) || [];
      arr.push(existing);
      matchIndex.set(key, arr);
    }

    const newPeople: Person[] = [];
    const personUpdates: { id: string; fields: Record<string, unknown> }[] = [];
    let peopleSkipped = 0;
    let peopleUpdated = 0;
    const matchedExistingIds = new Set<string>();

    for (const { pointer, person } of parsedPeople) {
      const gedcomMatch = gedcomIdIndex.get(pointer);
      const key = personMatchKey(person.firstName, person.lastName, person.middleName, person.birthDate);
      const nameMatches = matchIndex.get(key);
      const existing = gedcomMatch ?? (nameMatches?.length === 1 ? nameMatches[0] : undefined);

      if (existing) {
        personIdMap.set(pointer, existing.personId);
        matchedExistingIds.add(existing.personId);
        peopleSkipped++;

        const fields: Record<string, unknown> = {};
        if (person.biography && person.biography !== existing.biography && person.biography.length > (existing.biography?.length || 0)) {
          fields.biography = person.biography;
        }
        if (!existing.gedcomId) fields.gedcomId = pointer;

        // Update events if the incoming GEDCOM has them
        if (person.events && person.events.length > 0) {
          fields.events = person.events;
        }

        // Update citations if the incoming GEDCOM has them (and has more than existing)
        if (person.citations && person.citations.length > 0) {
          if (!existing.citations || person.citations.length > existing.citations.length) {
            fields.citations = person.citations;
          }
        }

        if (Object.keys(fields).length > 0) {
          peopleUpdated++;
          personUpdates.push({ id: existing.personId, fields });
        }
      } else {
        personIdMap.set(pointer, person.personId);
        newPeople.push(person);
      }
    }

    // ── Phase 4: Parse FAM records → relationships ──
    const relationships: Relationship[] = [];
    for (const node of getRecordsByTag(tree, 'FAM')) {
      try {
        const husbPtr = childValue(node, 'HUSB');
        const wifePtr = childValue(node, 'WIFE');

        if (husbPtr && wifePtr) {
          const spouse1Id = personIdMap.get(husbPtr);
          const spouse2Id = personIdMap.get(wifePtr);
          if (spouse1Id && spouse2Id) {
            const marrNode = findChild(node, 'MARR');
            const marriageDateResult = parseGedcomDate(marrNode ? childValue(marrNode, 'DATE') : undefined);
            if (marriageDateResult.warning) warnings.push(marriageDateResult.warning);
            let marriagePlace = marrNode ? childValue(marrNode, 'PLAC') : undefined;
            if (marriagePlace) marriagePlace = truncate(marriagePlace, 200, 'marriagePlace', warnings);

            const divNode = findChild(node, 'DIV');
            const divorceDateResult = parseGedcomDate(divNode ? childValue(divNode, 'DATE') : undefined);
            if (divorceDateResult.warning) warnings.push(divorceDateResult.warning);
            let divorcePlace = divNode ? childValue(divNode, 'PLAC') : undefined;
            if (divorcePlace) divorcePlace = truncate(divorcePlace, 200, 'divorcePlace', warnings);

            relationships.push({
              relationshipId: uuid(),
              relationshipType: RelationshipType.SPOUSE,
              person1Id: spouse1Id,
              person2Id: spouse2Id,
              metadata: {
                marriageDate: marriageDateResult.date,
                marriagePlace,
                divorceDate: divorceDateResult.date,
                divorcePlace,
              },
              createdAt: now,
            });
          }
        }

        for (const childNode of findChildren(node, 'CHIL')) {
          const childPtr = childNode.value;
          if (!childPtr) continue;
          const childId = personIdMap.get(childPtr);
          if (!childId) continue;
          if (husbPtr) {
            const parent1Id = personIdMap.get(husbPtr);
            if (parent1Id) {
              relationships.push({
                relationshipId: uuid(),
                relationshipType: RelationshipType.PARENT_CHILD,
                person1Id: parent1Id,
                person2Id: childId,
                createdAt: now,
              });
            }
          }
          if (wifePtr) {
            const parent2Id = personIdMap.get(wifePtr);
            if (parent2Id) {
              relationships.push({
                relationshipId: uuid(),
                relationshipType: RelationshipType.PARENT_CHILD,
                person1Id: parent2Id,
                person2Id: childId,
                createdAt: now,
              });
            }
          }
        }
      } catch (err) {
        console.error('GEDCOM parse family error:', err);
        errors.push('Failed to parse family: invalid data');
      }
    }

    // ── Phase 5: Deduplicate relationships ──
    const existingRelKeys = new Set<string>();
    if (matchedExistingIds.size > 0) {
      const fetched = new Set<string>();
      for (const personId of matchedExistingIds) {
        if (fetched.has(personId)) continue;
        fetched.add(personId);
        const rels = await this.relationshipRepo.findByPerson(personId);
        for (const rel of rels) {
          const fwd = `${rel.person1Id}|${rel.person2Id}|${rel.relationshipType}`;
          existingRelKeys.add(fwd);
          if (rel.relationshipType === RelationshipType.SPOUSE) {
            existingRelKeys.add(`${rel.person2Id}|${rel.person1Id}|${rel.relationshipType}`);
          }
        }
      }
    }

    const newRelationships: Relationship[] = [];
    let relationshipsSkipped = 0;
    for (const rel of relationships) {
      const key = `${rel.person1Id}|${rel.person2Id}|${rel.relationshipType}`;
      if (existingRelKeys.has(key)) {
        relationshipsSkipped++;
      } else {
        newRelationships.push(rel);
        existingRelKeys.add(key);
        if (rel.relationshipType === RelationshipType.SPOUSE) {
          existingRelKeys.add(`${rel.person2Id}|${rel.person1Id}|${rel.relationshipType}`);
        }
      }
    }

    // ── Phase 5b: Parse OBJE records → artifacts ──
    // Build REPO name index for resolving SOUR > REPO pointers
    const repoRecords = new Map<string, string>();
    for (const node of getRecordsByTag(tree, 'REPO')) {
      if (node.xref) repoRecords.set(node.xref, childValue(node, 'NAME') ?? '');
    }

    const objePointerToFile = new Map<string, { filePath: string; form: string; medi?: string; caption?: string; source?: string; date?: string; isPrimary?: boolean }>();
    for (const node of getRecordsByTag(tree, 'OBJE')) {
      const pointer = node.xref;
      if (!pointer) continue;
      const fileNode = findChild(node, 'FILE');
      const filePath = fileNode?.value;
      if (!filePath) continue;
      const formNode = fileNode ? findChild(fileNode, 'FORM') : undefined;
      const form = formNode?.value;
      const medi = formNode ? childValue(formNode, 'MEDI') : undefined;
      const caption = fileNode ? childValue(fileNode, 'TITL') : undefined;
      const date = childValue(node, 'DATE');
      const primTag = childValue(node, '_PRIM');
      const isPrimary = primTag?.toUpperCase() === 'Y';

      // Resolve SOUR pointer to source title for artifact.source
      const sourNode = findChild(node, 'SOUR');
      let source: string | undefined;
      if (sourNode?.value) {
        const sourRecord = getRecordsByTag(tree, 'SOUR').find((s) => s.xref === sourNode.value);
        if (sourRecord) {
          source = childValue(sourRecord, 'TITL');
        }
      }

      objePointerToFile.set(pointer, { filePath, form: form ?? '', medi, caption, source, date, isPrimary });
    }

    // Collect OBJE references from INDI records → person-artifact links
    const objePersonLinks: { pointer: string; personId: string }[] = [];
    for (const node of getRecordsByTag(tree, 'INDI')) {
      const indiPointer = node.xref;
      if (!indiPointer) continue;
      const resolvedPersonId = personIdMap.get(indiPointer);
      if (!resolvedPersonId) continue;
      for (const objeRef of findChildren(node, 'OBJE')) {
        if (objeRef.value) {
          // Reference to top-level OBJE record
          objePersonLinks.push({ pointer: objeRef.value, personId: resolvedPersonId });
        } else if (objeRef.children.length > 0) {
          // Inline OBJE (embedded in INDI)
          const fileNode = findChild(objeRef, 'FILE');
          const filePath = fileNode?.value;
          if (filePath) {
            const inlinePtr = `_inline_${resolvedPersonId}_${filePath}`;
            const form = fileNode ? childValue(fileNode, 'FORM') : undefined;
            const medi = fileNode ? childValue(findChild(fileNode, 'FORM') ?? fileNode, 'MEDI') : undefined;
            const caption = childValue(objeRef, 'TITL');
            const inlineDate = childValue(objeRef, 'DATE');
            const inlinePrim = childValue(objeRef, '_PRIM');
            objePointerToFile.set(inlinePtr, { filePath, form: form ?? '', medi, caption, date: inlineDate, isPrimary: inlinePrim?.toUpperCase() === 'Y' });
            objePersonLinks.push({ pointer: inlinePtr, personId: resolvedPersonId });
          }
        }
      }
    }

    // Create artifact records (only if we have media files from GEDZIP)
    const newArtifacts: Artifact[] = [];
    let artifactsSkipped = 0;
    if (mediaFiles && mediaFiles.size > 0) {
      for (const { pointer, personId } of objePersonLinks) {
        const objeInfo = objePointerToFile.get(pointer);
        if (!objeInfo) continue;

        // Strip path prefix to get just the filename
        const fileName = objeInfo.filePath.replace(/^media\//, '').replace(/^.*[\\/]/, '');
        const mediaBuffer = mediaFiles.get(fileName) ?? mediaFiles.get(objeInfo.filePath);
        if (!mediaBuffer) {
          warnings.push(`Artifact file not found in GEDZIP: ${objeInfo.filePath}`);
          artifactsSkipped++;
          continue;
        }

        const contentType = formToContentType(objeInfo.form);
        const artifactId = uuid();
        const s3Key = `artifacts/${personId}/${artifactId}/${fileName}`;

        try {
          await s3Client.send(
            new PutObjectCommand({
              Bucket: BucketNames.Photos,
              Key: s3Key,
              Body: mediaBuffer,
              ContentType: contentType,
            }),
          );

          newArtifacts.push({
            artifactId,
            personId,
            artifactType: mediToArtifactType(objeInfo.medi),
            s3Bucket: BucketNames.Photos,
            s3Key,
            fileName,
            fileSize: mediaBuffer.length,
            contentType,
            caption: objeInfo.caption,
            source: objeInfo.source,
            date: objeInfo.date,
            isPrimary: objeInfo.isPrimary ?? false,
            uploadedAt: now,
            uploadedBy: 'gedcom-import',
          });
        } catch (err) {
          console.error('GEDCOM artifact upload error:', err);
          errors.push(`Failed to upload artifact: ${fileName}`);
        }
      }
    } else if (objePersonLinks.length > 0) {
      // Plain GEDCOM import (no media files) — skip artifacts but note it
      artifactsSkipped = objePersonLinks.length;
      if (objePersonLinks.length > 0) {
        warnings.push(`${objePersonLinks.length} artifact reference(s) found but no media files provided (use GEDZIP for media import)`);
      }
    }

    // ── Phase 5c: Resolve event-level OBJE pointers to artifactIds ──
    // Build pointer → artifactId map from newly created artifacts
    const objePointerToArtifactId = new Map<string, string>();
    for (const { pointer: objePtr, personId } of objePersonLinks) {
      const objeInfo = objePointerToFile.get(objePtr);
      if (!objeInfo) continue;
      const fileName = objeInfo.filePath.replace(/^media\//, '').replace(/^.*[\\/]/, '');
      const found = newArtifacts.find((a) => a.personId === personId && a.fileName === fileName);
      if (found) objePointerToArtifactId.set(objePtr, found.artifactId);
    }

    // Resolve pending event OBJE links
    for (const link of pendingEventObjeLinks) {
      const personId = personIdMap.get(link.pointer);
      if (!personId) continue;
      const artifactId = objePointerToArtifactId.get(link.objePointer);
      if (!artifactId) continue;
      const entry = parsedPeople.find((p) => p.pointer === link.pointer);
      if (entry?.person.events?.[link.eventIndex]) {
        entry.person.events[link.eventIndex]!.artifactId = artifactId;
      }
    }

    // Auto-create events from artifact types (for artifacts not already linked via OBJE-under-event)
    const eventLinkedArtifactIds = new Set<string>();
    for (const link of pendingEventObjeLinks) {
      const artifactId = objePointerToArtifactId.get(link.objePointer);
      if (artifactId) eventLinkedArtifactIds.add(artifactId);
    }
    for (const artifact of newArtifacts) {
      if (eventLinkedArtifactIds.has(artifact.artifactId)) continue;
      const eventTag = ARTIFACT_TYPE_TO_EVENT_TAG[artifact.artifactType];
      if (!eventTag) continue;
      const entry = parsedPeople.find((p) => {
        const resolvedId = personIdMap.get(p.pointer);
        return resolvedId === artifact.personId;
      });
      if (!entry) continue;
      if (!entry.person.events) entry.person.events = [];
      if (entry.person.events.find((e) => e.artifactId === artifact.artifactId)) continue;
      const evt: PersonEvent = { type: eventTag, artifactId: artifact.artifactId };
      if (artifact.date) evt.date = artifact.date;
      entry.person.events.push(evt);
    }

    // ── Phase 6: Write to database ──
    if (newSources.length > 0) await this.sourceRepo.batchCreate(newSources);
    if (newPeople.length > 0) await this.personRepo.batchCreate(newPeople);
    if (newRelationships.length > 0) await this.relationshipRepo.batchCreate(newRelationships);

    for (const artifact of newArtifacts) {
      try {
        await this.artifactRepo.create(artifact);
      } catch (err) {
        console.error('GEDCOM artifact create error:', err);
        errors.push(`Failed to create artifact record: ${artifact.fileName}`);
      }
    }

    for (const { id, fields } of personUpdates) {
      try {
        await this.personRepo.update(id, { ...fields, updatedAt: now });
      } catch (err) {
        console.error('GEDCOM update person error:', err);
        errors.push(`Failed to update person ${id}`);
      }
    }

    // ── Phase 7: Import metadata.json data (entries + artifact metadata) ──
    let entriesAdded = 0;
    if (metadata) {
      // Import entries
      if (metadata.entries && metadata.entries.length > 0) {
        for (const entry of metadata.entries) {
          try {
            await this.entryRepo.create(entry);
            entriesAdded++;
          } catch (err) {
            console.error('GEDCOM entry import error:', err);
            errors.push(`Failed to import entry: ${entry.entryId}`);
          }
        }
      }

      // Apply artifact metadata to newly created artifacts
      if (metadata.artifactMetadata) {
        for (const artifact of newArtifacts) {
          const meta = metadata.artifactMetadata[artifact.artifactId];
          if (meta && Object.keys(meta).length > 0) {
            try {
              await this.artifactRepo.update(artifact.artifactId, artifact.personId, { metadata: meta });
            } catch (err) {
              console.error('GEDCOM artifact metadata update error:', err);
            }
          }
        }
      }
    }

    return {
      peopleAdded: newPeople.length,
      peopleSkipped,
      peopleUpdated,
      relationshipsAdded: newRelationships.length,
      relationshipsSkipped,
      sourcesAdded: newSources.length,
      sourcesSkipped,
      artifactsAdded: newArtifacts.length,
      artifactsSkipped,
      ...(entriesAdded > 0 && { entriesAdded }),
      errors,
      warnings,
    };
  }
}
