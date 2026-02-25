import type { GedcomImportResult, Person, Relationship } from '@cloud-family-tree/shared';
import { DateQualifier, Gender, isoNow, RelationshipType } from '@cloud-family-tree/shared';
import { readGedcom } from 'read-gedcom';
import { v4 as uuid } from 'uuid';
import { PersonRepository } from '../repositories/person.repository';
import { RelationshipRepository } from '../repositories/relationship.repository';

function mapGender(gedcomGender: string | undefined): Gender {
  switch (gedcomGender?.toUpperCase()) {
    case 'M':
      return Gender.MALE;
    case 'F':
      return Gender.FEMALE;
    default:
      return Gender.UNKNOWN;
  }
}

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

function parseGedcomDate(dateStr: string | undefined): ParsedDate {
  if (!dateStr) return { date: undefined };
  // Strip common GEDCOM date prefixes (ABT, AFT, BEF, EST, CAL, etc.)
  const prefixMatch = dateStr.match(/^(ABT|AFT|BEF|EST|CAL|FROM|TO|INT)\s+/i);
  const qualifier = prefixMatch ? prefixMatch[1]!.toUpperCase() : undefined;
  const cleaned = qualifier ? dateStr.slice(prefixMatch![0].length).trim() : dateStr.trim();
  if (!cleaned) return { date: undefined };
  const months: Record<string, string> = {
    JAN: '01',
    FEB: '02',
    MAR: '03',
    APR: '04',
    MAY: '05',
    JUN: '06',
    JUL: '07',
    AUG: '08',
    SEP: '09',
    OCT: '10',
    NOV: '11',
    DEC: '12',
  };

  let parsed: string | undefined;

  // Full date: 15 MAR 1960 → 1960-03-15
  const fullMatch = cleaned.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/);
  if (fullMatch) {
    const [, day, mon, year] = fullMatch;
    const month = months[mon!];
    if (month) parsed = `${year}-${month}-${day?.padStart(2, '0')}`;
  }
  // Month + year: SEP 1883 → 1883-09
  if (!parsed) {
    const monthYearMatch = cleaned.match(/^([A-Z]{3})\s+(\d{4})$/);
    if (monthYearMatch) {
      const [, mon, year] = monthYearMatch;
      const month = months[mon!];
      if (month) parsed = `${year}-${month}`;
    }
  }
  // Year only: 1715 → 1715
  if (!parsed) {
    const yearMatch = cleaned.match(/^(\d{4})$/);
    if (yearMatch) {
      parsed = yearMatch[1]!;
    }
  }

  if (!parsed) return { date: undefined };

  // Validate the parsed date is semantically valid
  const parts = parsed.split('-').map(Number);
  if (parts.length === 3) {
    const [y, m, d] = parts;
    const dateObj = new Date(y!, m! - 1, d);
    if (dateObj.getFullYear() !== y || dateObj.getMonth() !== m! - 1 || dateObj.getDate() !== d) {
      return { date: undefined, warning: `Invalid date in GEDCOM: "${dateStr}"` };
    }
  } else if (parts.length === 2) {
    const [, m] = parts;
    if (m! < 1 || m! > 12) {
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

// Safely extract string value from a read-gedcom selection
function valStr(sel: unknown): string | undefined {
  try {
    // read-gedcom selections have a .value() method returning an array
    const values = (sel as { value: () => unknown[] }).value();
    if (Array.isArray(values) && values.length > 0) return String(values[0]);
  } catch {
    /* no value */
  }
  return undefined;
}

function ptrStr(sel: unknown): string | undefined {
  try {
    const ptrs = (sel as { pointer: () => unknown[] }).pointer();
    if (Array.isArray(ptrs) && ptrs.length > 0) return String(ptrs[0]);
  } catch {
    /* no pointer */
  }
  return undefined;
}

function truncate(str: string, max: number, label: string, warnings: string[]): string {
  if (str.length <= max) return str;
  warnings.push(`${label} truncated from ${str.length} to ${max} characters`);
  return str.slice(0, max);
}

function personMatchKey(
  firstName: string,
  lastName: string,
  middleName?: string,
  birthDate?: string,
): string {
  return `${firstName.toUpperCase()}|${(middleName || '').toUpperCase()}|${lastName.toUpperCase()}|${birthDate || ''}`;
}

export class GedcomImportService {
  private readonly personRepo = new PersonRepository();
  private readonly relationshipRepo = new RelationshipRepository();

  async import(gedcomContent: string): Promise<GedcomImportResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Strip blank lines — read-gedcom parser rejects empty lines
    const cleanedContent = gedcomContent
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .join('\n');

    const buf = new TextEncoder().encode(cleanedContent);
    const gedcom = readGedcom(buf.buffer as ArrayBuffer);

    // Maps GEDCOM pointer (e.g. @I1@) → final person UUID (new or existing)
    const idMap = new Map<string, string>();
    const parsedPeople: { pointer: string; person: Person }[] = [];
    const relationships: Relationship[] = [];
    const now = isoNow();

    // ── Phase 1: Parse all people from GEDCOM ──
    const indiRecords = gedcom.getIndividualRecord();
    for (const indi of indiRecords.arraySelect()) {
      try {
        const pointer = ptrStr(indi);
        if (!pointer) continue;

        const nameValue = valStr(indi.getName());
        const nameParts = nameValue?.split('/').map((s: string) => s.trim()) || [];
        const givenNames = nameParts[0] || 'Unknown';
        const lastName = nameParts[1] || 'Unknown';
        const spaceIdx = givenNames.indexOf(' ');
        let firstName = spaceIdx > 0 ? givenNames.slice(0, spaceIdx) : givenNames;
        let middleName = spaceIdx > 0 ? givenNames.slice(spaceIdx + 1) : undefined;
        let lastNameTrimmed = lastName;

        // Enforce field length limits
        firstName = truncate(firstName, 100, `${pointer} firstName`, warnings);
        if (middleName) middleName = truncate(middleName, 100, `${pointer} middleName`, warnings);
        lastNameTrimmed = truncate(lastNameTrimmed, 100, `${pointer} lastName`, warnings);

        const sex = valStr(indi.getSex());
        const birthEvent = indi.getEventBirth();
        const deathEvent = indi.getEventDeath();

        const birthDateResult = parseGedcomDate(valStr(birthEvent.getDate()));
        const deathDateResult = parseGedcomDate(valStr(deathEvent.getDate()));
        if (birthDateResult.warning) warnings.push(`${pointer}: ${birthDateResult.warning}`);
        if (deathDateResult.warning) warnings.push(`${pointer}: ${deathDateResult.warning}`);

        let birthPlace = valStr(birthEvent.getPlace());
        let deathPlace = valStr(deathEvent.getPlace());
        if (birthPlace) birthPlace = truncate(birthPlace, 200, `${pointer} birthPlace`, warnings);
        if (deathPlace) deathPlace = truncate(deathPlace, 200, `${pointer} deathPlace`, warnings);

        // Import BURI place
        let burialPlace: string | undefined;
        try {
          const buriPlaceVal = valStr(indi.get('BURI').get('PLAC'));
          if (buriPlaceVal)
            burialPlace = truncate(buriPlaceVal, 200, `${pointer} burialPlace`, warnings);
        } catch {
          /* no BURI tag */
        }

        // Import NOTE as biography (read-gedcom handles CONT/CONC reassembly)
        let biography: string | undefined;
        try {
          const noteValue = valStr(indi.get('NOTE'));
          if (noteValue) {
            biography = truncate(noteValue, 5000, `${pointer} biography`, warnings);
          }
        } catch {
          /* no NOTE tag */
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
            gedcomId: pointer,
            createdAt: now,
            updatedAt: now,
          },
        });
      } catch (err) {
        errors.push(`Failed to parse person: ${err}`);
      }
    }

    // ── Phase 2: Deduplicate against existing DB records ──
    const existingPeople: Person[] = [];
    for await (const batch of this.personRepo.iterateAll()) {
      existingPeople.push(...batch);
    }

    // Build gedcomId index for exact pointer matching (preferred)
    const gedcomIdIndex = new Map<string, Person>();
    // Build name-based match index as fallback
    const matchIndex = new Map<string, Person[]>();
    for (const existing of existingPeople) {
      if (existing.gedcomId) {
        gedcomIdIndex.set(existing.gedcomId, existing);
      }
      const key = personMatchKey(
        existing.firstName,
        existing.lastName,
        existing.middleName,
        existing.birthDate,
      );
      const arr = matchIndex.get(key) || [];
      arr.push(existing);
      matchIndex.set(key, arr);
    }

    const newPeople: Person[] = [];
    const personUpdates: { id: string; fields: Record<string, string> }[] = [];
    let peopleSkipped = 0;
    let peopleUpdated = 0;
    const matchedExistingIds = new Set<string>();

    for (const { pointer, person } of parsedPeople) {
      // Priority 1: Match by GEDCOM pointer (exact, unambiguous)
      const gedcomMatch = gedcomIdIndex.get(pointer);
      // Priority 2: Fall back to name+birthDate matching (unique match only)
      const key = personMatchKey(
        person.firstName,
        person.lastName,
        person.middleName,
        person.birthDate,
      );
      const nameMatches = matchIndex.get(key);
      const existing = gedcomMatch ?? (nameMatches?.length === 1 ? nameMatches[0] : undefined);

      if (existing) {
        idMap.set(pointer, existing.personId);
        matchedExistingIds.add(existing.personId);
        peopleSkipped++;

        const fields: Record<string, string> = {};

        // Update biography if the incoming version has more content
        if (
          person.biography &&
          person.biography !== existing.biography &&
          person.biography.length > (existing.biography?.length || 0)
        ) {
          fields.biography = person.biography;
          peopleUpdated++;
          warnings.push(
            `${pointer} (${person.firstName} ${person.lastName}): matched existing, biography updated`,
          );
        }

        // Backfill gedcomId on existing records that were imported before this feature
        if (!existing.gedcomId) {
          fields.gedcomId = pointer;
        }

        if (Object.keys(fields).length > 0) {
          personUpdates.push({ id: existing.personId, fields });
        }
      } else {
        // No match or ambiguous (multiple name matches) — create new
        idMap.set(pointer, person.personId);
        newPeople.push(person);
      }
    }

    // ── Phase 3: Parse families / relationships ──
    const famRecords = gedcom.getFamilyRecord();
    for (const fam of famRecords.arraySelect()) {
      try {
        const husbandPtr = valStr(fam.getHusband());
        const wifePtr = valStr(fam.getWife());

        if (husbandPtr && wifePtr) {
          const husbandId = idMap.get(husbandPtr);
          const wifeId = idMap.get(wifePtr);
          if (husbandId && wifeId) {
            const marriageEvent = fam.getEventMarriage();
            const marriageDateResult = parseGedcomDate(valStr(marriageEvent.getDate()));
            if (marriageDateResult.warning) warnings.push(marriageDateResult.warning);
            let marriagePlace = valStr(marriageEvent.getPlace());
            if (marriagePlace)
              marriagePlace = truncate(marriagePlace, 200, 'marriagePlace', warnings);
            relationships.push({
              relationshipId: uuid(),
              relationshipType: RelationshipType.SPOUSE,
              person1Id: husbandId,
              person2Id: wifeId,
              metadata: {
                marriageDate: marriageDateResult.date,
                marriagePlace,
              },
              createdAt: now,
            });
          }
        }

        const childSelection = fam.getChild();
        for (const child of childSelection.arraySelect()) {
          const childPtr = valStr(child);
          if (!childPtr) continue;
          const childId = idMap.get(childPtr);
          if (!childId) continue;
          if (husbandPtr) {
            const fatherId = idMap.get(husbandPtr);
            if (fatherId) {
              relationships.push({
                relationshipId: uuid(),
                relationshipType: RelationshipType.PARENT_CHILD,
                person1Id: fatherId,
                person2Id: childId,
                createdAt: now,
              });
            }
          }
          if (wifePtr) {
            const motherId = idMap.get(wifePtr);
            if (motherId) {
              relationships.push({
                relationshipId: uuid(),
                relationshipType: RelationshipType.PARENT_CHILD,
                person1Id: motherId,
                person2Id: childId,
                createdAt: now,
              });
            }
          }
        }
      } catch (err) {
        errors.push(`Failed to parse family: ${err}`);
      }
    }

    // ── Phase 4: Deduplicate relationships ──
    // Load existing relationships for matched people only
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
        // Track newly-added relationships so later entries in the same file don't duplicate
        existingRelKeys.add(key);
        if (rel.relationshipType === RelationshipType.SPOUSE) {
          existingRelKeys.add(`${rel.person2Id}|${rel.person1Id}|${rel.relationshipType}`);
        }
      }
    }

    // ── Phase 5: Write to database ──
    if (newPeople.length > 0) await this.personRepo.batchCreate(newPeople);
    if (newRelationships.length > 0) await this.relationshipRepo.batchCreate(newRelationships);

    // Apply updates for matched people (biography, gedcomId backfill)
    for (const { id, fields } of personUpdates) {
      try {
        await this.personRepo.update(id, { ...fields, updatedAt: now });
      } catch (err) {
        errors.push(`Failed to update person ${id}: ${err}`);
      }
    }

    return {
      peopleAdded: newPeople.length,
      peopleSkipped: peopleSkipped,
      peopleUpdated: peopleUpdated,
      relationshipsAdded: newRelationships.length,
      relationshipsSkipped,
      photosAdded: 0,
      errors,
      warnings,
    };
  }
}
