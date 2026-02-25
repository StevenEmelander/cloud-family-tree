import type { GedcomExportResult, Person, Relationship } from '@cloud-family-tree/shared';
import { isoNow } from '@cloud-family-tree/shared';
import { PersonRepository } from '../repositories/person.repository';
import { RelationshipRepository } from '../repositories/relationship.repository';

const MAX_LINE_LENGTH = 255;

// Convert stored date (YYYY, YYYY-MM, or YYYY-MM-DD) to GEDCOM date format
function toGedcomDate(isoDate: string | undefined): string | undefined {
  if (!isoDate) return undefined;
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  const parts = isoDate.split('-');
  // Year only: "1715" → "1715"
  if (parts.length === 1) return parts[0];
  // Month-year: "1883-09" → "SEP 1883"
  if (parts.length === 2) {
    const [year, month] = parts;
    const monthStr = month ?? '';
    const monthIdx = Number.parseInt(monthStr, 10) - 1;
    if (monthIdx < 0 || monthIdx > 11) return undefined;
    return `${months[monthIdx]} ${year}`;
  }
  // Full date: "1960-03-15" → "15 MAR 1960"
  const [year, month, day] = parts;
  if (!year || !month || !day) return undefined;
  const monthIdx = Number.parseInt(month, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return undefined;
  return `${Number.parseInt(day, 10)} ${months[monthIdx]} ${year}`;
}

function genderToGedcom(gender: string): string {
  switch (gender) {
    case 'MALE':
      return 'M';
    case 'FEMALE':
      return 'F';
    default:
      return 'U';
  }
}

// Wrap long text using CONT (newlines) and CONC (continuation) per GEDCOM 5.5.1
function wrapText(level: number, tag: string, text: string): string[] {
  const lines: string[] = [];
  const textLines = text.split('\n');
  const concLevel = level + 1;

  for (let i = 0; i < textLines.length; i++) {
    const textLine = textLines[i] ?? '';
    let lineTag: string;
    let tagLevel: number;

    if (i === 0) {
      lineTag = tag;
      tagLevel = level;
    } else {
      lineTag = 'CONT';
      tagLevel = concLevel;
    }

    const prefix = `${tagLevel} ${lineTag} `;
    if (prefix.length + textLine.length <= MAX_LINE_LENGTH) {
      lines.push(`${prefix}${textLine}`);
    } else {
      // First chunk with the tag
      const maxFirst = MAX_LINE_LENGTH - prefix.length;
      lines.push(`${prefix}${textLine.slice(0, maxFirst)}`);
      let rest = textLine.slice(maxFirst);
      // Remaining chunks with CONC
      const concPrefix = `${concLevel} CONC `;
      const maxConc = MAX_LINE_LENGTH - concPrefix.length;
      while (rest.length > 0) {
        lines.push(`${concPrefix}${rest.slice(0, maxConc)}`);
        rest = rest.slice(maxConc);
      }
    }
  }

  return lines;
}

// Write a single-value GEDCOM line, using CONC if it exceeds max length
function gedcomLine(level: number, tag: string, value: string): string[] {
  const prefix = `${level} ${tag} `;
  if (prefix.length + value.length <= MAX_LINE_LENGTH) {
    return [`${prefix}${value}`];
  }
  return wrapText(level, tag, value);
}

export class GedcomExportService {
  private readonly personRepo = new PersonRepository();
  private readonly relationshipRepo = new RelationshipRepository();

  async export(): Promise<GedcomExportResult> {
    const lines: string[] = [];
    const idToPointer = new Map<string, string>();
    const idToPerson = new Map<string, Person>();
    let indiCounter = 1;
    let famCounter = 1;

    // Collect all people
    const allPeople: Person[] = [];
    for await (const batch of this.personRepo.iterateAll()) {
      allPeople.push(...batch);
    }

    // Collect all relationships
    const allRelationships: Relationship[] = [];
    const seenRelIds = new Set<string>();
    for (const person of allPeople) {
      const rels = await this.relationshipRepo.findByPerson(person.personId);
      for (const rel of rels) {
        if (!seenRelIds.has(rel.relationshipId)) {
          seenRelIds.add(rel.relationshipId);
          allRelationships.push(rel);
        }
      }
    }

    // Assign GEDCOM pointers and build lookup
    for (const person of allPeople) {
      idToPointer.set(person.personId, `@I${indiCounter}@`);
      idToPerson.set(person.personId, person);
      indiCounter++;
    }

    // Group relationships into families (spouse pairs with their children)
    const families = this.buildFamilies(allRelationships, idToPerson);
    const famPointers = new Map<string, string>();
    for (const famKey of families.keys()) {
      famPointers.set(famKey, `@F${famCounter}@`);
      famCounter++;
    }

    // GEDCOM header
    lines.push('0 HEAD');
    lines.push('1 SOUR CloudFamilyTree');
    lines.push('2 VERS 0.1.0');
    lines.push('1 SUBM @U1@');
    lines.push('1 GEDC');
    lines.push('2 VERS 5.5.1');
    lines.push('2 FORM LINEAGE-LINKED');
    lines.push('1 CHAR UTF-8');
    lines.push(`1 DATE ${toGedcomDate(isoNow().split('T')[0])}`);

    // Submitter record (required by GEDCOM 5.5.1)
    lines.push('0 @U1@ SUBM');
    lines.push('1 NAME CloudFamilyTree');

    // Person records
    for (const person of allPeople) {
      // biome-ignore lint/style/noNonNullAssertion: pointer is guaranteed to exist — assigned in the loop above for every person
      const pointer = idToPointer.get(person.personId)!;
      lines.push(`0 ${pointer} INDI`);
      const givenNames = person.middleName
        ? `${person.firstName} ${person.middleName}`
        : person.firstName;
      lines.push(...gedcomLine(1, 'NAME', `${givenNames} /${person.lastName}/`));
      lines.push(...gedcomLine(2, 'GIVN', givenNames));
      lines.push(...gedcomLine(2, 'SURN', person.lastName));
      lines.push(`1 SEX ${genderToGedcom(person.gender)}`);

      if (person.birthDate || person.birthPlace) {
        lines.push('1 BIRT');
        if (person.birthDate) {
          const dateStr = toGedcomDate(person.birthDate);
          const prefix = person.birthDateQualifier ? `${person.birthDateQualifier} ` : '';
          lines.push(`2 DATE ${prefix}${dateStr}`);
        }
        if (person.birthPlace) lines.push(...gedcomLine(2, 'PLAC', person.birthPlace));
      }

      if (person.deathDate || person.deathPlace) {
        lines.push('1 DEAT');
        if (person.deathDate) {
          const dateStr = toGedcomDate(person.deathDate);
          const prefix = person.deathDateQualifier ? `${person.deathDateQualifier} ` : '';
          lines.push(`2 DATE ${prefix}${dateStr}`);
        }
        if (person.deathPlace) lines.push(...gedcomLine(2, 'PLAC', person.deathPlace));
      }

      if (person.burialPlace) {
        lines.push('1 BURI');
        lines.push(...gedcomLine(2, 'PLAC', person.burialPlace));
      }

      if (person.biography) {
        lines.push(...wrapText(1, 'NOTE', person.biography));
      }

      // Link to families
      for (const [famKey, famPointer] of famPointers.entries()) {
        // biome-ignore lint/style/noNonNullAssertion: famKey comes from iterating families.keys(), so the entry always exists
        const family = families.get(famKey)!;
        if (family.spouse1Id === person.personId || family.spouse2Id === person.personId) {
          lines.push(`1 FAMS ${famPointer}`);
        }
        if (family.childIds.includes(person.personId)) {
          lines.push(`1 FAMC ${famPointer}`);
        }
      }
    }

    // Family records
    for (const [famKey, family] of families.entries()) {
      // biome-ignore lint/style/noNonNullAssertion: famKey comes from iterating families which has matching famPointers entries
      const famPointer = famPointers.get(famKey)!;
      lines.push(`0 ${famPointer} FAM`);

      if (family.spouse1Id) {
        const ptr = idToPointer.get(family.spouse1Id);
        if (ptr) lines.push(`1 HUSB ${ptr}`);
      }
      if (family.spouse2Id) {
        const ptr = idToPointer.get(family.spouse2Id);
        if (ptr) lines.push(`1 WIFE ${ptr}`);
      }
      for (const childId of family.childIds) {
        const ptr = idToPointer.get(childId);
        if (ptr) lines.push(`1 CHIL ${ptr}`);
      }
      if (family.marriageDate || family.marriagePlace) {
        lines.push('1 MARR');
        if (family.marriageDate) lines.push(`2 DATE ${toGedcomDate(family.marriageDate)}`);
        if (family.marriagePlace) lines.push(...gedcomLine(2, 'PLAC', family.marriagePlace));
      }
      if (family.divorceDate || family.divorcePlace) {
        lines.push('1 DIV');
        if (family.divorceDate) lines.push(`2 DATE ${toGedcomDate(family.divorceDate)}`);
        if (family.divorcePlace) lines.push(...gedcomLine(2, 'PLAC', family.divorcePlace));
      }
    }

    // Trailer
    lines.push('0 TRLR');

    const gedcomContent = lines.join('\n');

    return {
      gedcomContent,
      peopleExported: allPeople.length,
      relationshipsExported: allRelationships.length,
      exportedAt: isoNow(),
    };
  }

  private buildFamilies(
    relationships: Relationship[],
    people: Map<string, Person>,
  ): Map<string, Family> {
    const families = new Map<string, Family>();

    // First pass: spouse relationships define families
    const spouseRels = relationships.filter((r) => r.relationshipType === 'SPOUSE');
    for (const rel of spouseRels) {
      const famKey = [rel.person1Id, rel.person2Id].sort().join('#');
      // Assign GEDCOM HUSB/WIFE roles based on gender (required by GEDCOM 5.5.1 spec)
      const person1 = people.get(rel.person1Id);
      const person2 = people.get(rel.person2Id);
      let spouse1Id = rel.person1Id;
      let spouse2Id = rel.person2Id;
      if (person1 && person2) {
        if (person1.gender === 'FEMALE' && person2.gender !== 'FEMALE') {
          spouse1Id = rel.person2Id;
          spouse2Id = rel.person1Id;
        } else if (person2.gender === 'MALE' && person1.gender !== 'MALE') {
          spouse1Id = rel.person2Id;
          spouse2Id = rel.person1Id;
        }
      }
      families.set(famKey, {
        spouse1Id,
        spouse2Id,
        childIds: [],
        marriageDate: rel.metadata?.marriageDate,
        marriagePlace: rel.metadata?.marriagePlace,
        divorceDate: rel.metadata?.divorceDate,
        divorcePlace: rel.metadata?.divorcePlace,
      });
    }

    // Second pass: parent-child relationships add children to families
    const parentChildRels = relationships.filter((r) => r.relationshipType === 'PARENT_CHILD');

    // Group children by parent
    const parentToChildren = new Map<string, string[]>();
    for (const rel of parentChildRels) {
      const children = parentToChildren.get(rel.person1Id) || [];
      children.push(rel.person2Id);
      parentToChildren.set(rel.person1Id, children);
    }

    // Add children to existing families or create new ones
    for (const [, family] of families.entries()) {
      const children1 = family.spouse1Id ? parentToChildren.get(family.spouse1Id) || [] : [];
      const children2 = family.spouse2Id ? parentToChildren.get(family.spouse2Id) || [] : [];
      // Children of this couple are those who appear in both parent lists
      const commonChildren = children1.filter((c) => children2.includes(c));
      family.childIds = [...new Set(commonChildren)];
    }

    // Handle single-parent families (parent-child without spouse)
    for (const [parentId, childIds] of parentToChildren.entries()) {
      for (const childId of childIds) {
        const alreadyInFamily = Array.from(families.values()).some((f) =>
          f.childIds.includes(childId),
        );
        if (!alreadyInFamily) {
          const famKey = `single#${parentId}#${childId}`;
          const existing = families.get(famKey);
          if (existing) {
            existing.childIds.push(childId);
          } else {
            // Assign GEDCOM HUSB/WIFE role based on gender (required by spec)
            const parent = people.get(parentId);
            const isFemale = parent?.gender === 'FEMALE';
            families.set(famKey, {
              spouse1Id: isFemale ? undefined : parentId,
              spouse2Id: isFemale ? parentId : undefined,
              childIds: [childId],
            });
          }
        }
      }
    }

    return families;
  }
}

interface Family {
  spouse1Id?: string; // GEDCOM HUSB role
  spouse2Id?: string; // GEDCOM WIFE role
  childIds: string[];
  marriageDate?: string;
  marriagePlace?: string;
  divorceDate?: string;
  divorcePlace?: string;
}
