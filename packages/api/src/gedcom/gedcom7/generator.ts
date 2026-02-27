import type { Artifact, Person, Relationship, Source } from '@cloud-family-tree/shared';
import { isoNow } from '@cloud-family-tree/shared';

/**
 * Convert stored date (YYYY, YYYY-MM, or YYYY-MM-DD) to GEDCOM date format.
 */
export function toGedcomDate(isoDate: string | undefined): string | undefined {
  if (!isoDate) return undefined;
  const months = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];
  const parts = isoDate.split('-');
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) {
    const monthIdx = Number.parseInt(parts[1] as string, 10) - 1;
    if (monthIdx < 0 || monthIdx > 11) return undefined;
    return `${months[monthIdx]} ${parts[0]}`;
  }
  const [year, month, day] = parts;
  if (!year || !month || !day) return undefined;
  const monthIdx = Number.parseInt(month, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return undefined;
  return `${Number.parseInt(day, 10)} ${months[monthIdx]} ${year}`;
}

function genderToGedcom(gender: string): string {
  switch (gender) {
    case 'MALE': return 'M';
    case 'FEMALE': return 'F';
    case 'OTHER': return 'X';
    default: return 'U';
  }
}

/** Wrap multi-line text using CONT (GEDCOM 7 — no CONC, no line length limit) */
function wrapText(level: number, tag: string, text: string): string[] {
  const textLines = text.split('\n');
  const lines: string[] = [];
  for (let i = 0; i < textLines.length; i++) {
    if (i === 0) {
      lines.push(`${level} ${tag} ${textLines[i]}`);
    } else {
      lines.push(`${level + 1} CONT ${textLines[i]}`);
    }
  }
  return lines;
}

interface Family {
  spouse1Id?: string;
  spouse2Id?: string;
  childIds: string[];
  marriageDate?: string;
  marriageDateQualifier?: string;
  marriagePlace?: string;
  divorceDate?: string;
  divorceDateQualifier?: string;
  divorcePlace?: string;
}

interface GenerateOptions {
  people: Person[];
  relationships: Relationship[];
  sources: Source[];
  artifacts: Artifact[];
  /** Map of artifactId → relative file path in GEDZIP (e.g. "media/photo.jpg") */
  artifactFilePaths?: Map<string, string>;
}

/**
 * Generate GEDCOM 7.0 text content from application data.
 */
export function generateGedcom7(opts: GenerateOptions): string {
  const { people, relationships, sources, artifacts, artifactFilePaths } = opts;
  const lines: string[] = [];

  const personToPointer = new Map<string, string>();
  const sourceToPointer = new Map<string, string>();
  const artifactToPointer = new Map<string, string>();
  const personById = new Map<string, Person>();

  let indiCounter = 1;
  let famCounter = 1;
  let sourCounter = 1;
  let objeCounter = 1;

  // Assign pointers
  for (const p of people) {
    personToPointer.set(p.personId, `@I${indiCounter}@`);
    personById.set(p.personId, p);
    indiCounter++;
  }
  for (const s of sources) {
    sourceToPointer.set(s.sourceId, `@S${sourCounter}@`);
    sourCounter++;
  }
  for (const a of artifacts) {
    artifactToPointer.set(a.artifactId, `@O${objeCounter}@`);
    objeCounter++;
  }

  // Build auto-generated source records for artifact.source free-text values
  const artifactSourceToPointer = new Map<string, string>();
  for (const a of artifacts) {
    if (a.source && !artifactSourceToPointer.has(a.source)) {
      artifactSourceToPointer.set(a.source, `@S${sourCounter}@`);
      sourCounter++;
    }
  }

  // Build families
  const families = buildFamilies(relationships, personById);
  const famPointers = new Map<string, string>();
  for (const famKey of families.keys()) {
    famPointers.set(famKey, `@F${famCounter}@`);
    famCounter++;
  }

  // Collect unique repository names for REPO records
  let repoCounter = 1;
  const repoNameToPointer = new Map<string, string>();
  for (const source of sources) {
    if (source.repositoryName && !repoNameToPointer.has(source.repositoryName)) {
      repoNameToPointer.set(source.repositoryName, `@R${repoCounter}@`);
      repoCounter++;
    }
  }

  // Track whether we need the _PRIM extension schema
  const usesPrim = artifacts.some((a) => a.isPrimary);

  // ── Header ──
  lines.push('0 HEAD');
  lines.push('1 GEDC');
  lines.push('2 VERS 7.0');
  if (usesPrim) {
    lines.push('1 SCHMA');
    lines.push('2 TAG _PRIM https://emelanderfamily.com/gedcom/ext/_PRIM');
  }
  lines.push('1 SOUR CloudFamilyTree');
  lines.push('2 VERS 0.2.0');
  const exportDate = toGedcomDate(isoNow().split('T')[0]);
  if (exportDate) lines.push(`1 DATE ${exportDate}`);

  // ── REPO records ──
  for (const [repoName, ptr] of repoNameToPointer.entries()) {
    lines.push(`0 ${ptr} REPO`);
    lines.push(...wrapText(1, 'NAME', repoName));
    // Attach URL from any source that references this repo
    const sourceWithUrl = sources.find((s) => s.repositoryName === repoName && s.url);
    if (sourceWithUrl?.url) {
      lines.push('1 ADDR');
      lines.push(...wrapText(2, 'WWW', sourceWithUrl.url));
    }
  }

  // ── SOUR records ──
  for (const source of sources) {
    const ptr = sourceToPointer.get(source.sourceId) as string;
    lines.push(`0 ${ptr} SOUR`);
    lines.push(...wrapText(1, 'TITL', source.title));
    if (source.author) lines.push(...wrapText(1, 'AUTH', source.author));
    if (source.publicationInfo) lines.push(...wrapText(1, 'PUBL', source.publicationInfo));
    if (source.repositoryName) {
      const repoPtr = repoNameToPointer.get(source.repositoryName);
      if (repoPtr) lines.push(`1 REPO ${repoPtr}`);
    }
    if (source.url && !source.repositoryName) {
      // URL without a repo — include as NOTE since WWW is not valid under SOUR
      lines.push(...wrapText(1, 'NOTE', `URL: ${source.url}`));
    }
    if (source.notes) lines.push(...wrapText(1, 'NOTE', source.notes));
  }

  // ── Auto-generated SOUR records for artifact source text ──
  for (const [sourceText, ptr] of artifactSourceToPointer.entries()) {
    lines.push(`0 ${ptr} SOUR`);
    lines.push(...wrapText(1, 'TITL', sourceText));
  }

  // ── OBJE records ──
  for (const artifact of artifacts) {
    const ptr = artifactToPointer.get(artifact.artifactId) as string;
    const filePath = artifactFilePaths?.get(artifact.artifactId) ?? artifact.fileName;
    lines.push(`0 ${ptr} OBJE`);
    lines.push(`1 FILE ${filePath}`);
    lines.push(`2 FORM ${mimeToForm(artifact.contentType)}`);
    lines.push(`3 MEDI ${artifactTypeToMedia(artifact.artifactType)}`);
    if (artifact.caption) lines.push(...wrapText(2, 'TITL', artifact.caption));
    if (artifact.source) {
      const sourPtr = artifactSourceToPointer.get(artifact.source);
      if (sourPtr) lines.push(`1 SOUR ${sourPtr}`);
    }
    if (artifact.date) {
      const dateStr = toGedcomDate(artifact.date);
      if (dateStr) {
        lines.push('1 NOTE');
        lines.push(`2 CONT Date: ${dateStr}`);
      }
    }
    if (artifact.isPrimary) lines.push('1 _PRIM Y');
  }

  // ── INDI records ──
  for (const person of people) {
    const ptr = personToPointer.get(person.personId) as string;
    lines.push(`0 ${ptr} INDI`);

    // Primary name
    const givenNames = person.middleName
      ? `${person.firstName} ${person.middleName}`
      : person.firstName;
    let nameStr = `${givenNames} /${person.lastName}/`;
    if (person.suffix) nameStr += ` ${person.suffix}`;
    lines.push(`1 NAME ${nameStr}`);
    lines.push(`2 GIVN ${givenNames}`);
    lines.push(`2 SURN ${person.lastName}`);
    if (person.prefix) lines.push(`2 NPFX ${person.prefix}`);
    if (person.suffix) lines.push(`2 NSFX ${person.suffix}`);
    if (person.nickname) lines.push(`2 NICK ${person.nickname}`);

    // Alternate names
    if (person.alternateNames) {
      for (const alt of person.alternateNames) {
        const altGiven = alt.middleName
          ? `${alt.firstName ?? ''} ${alt.middleName}`.trim()
          : alt.firstName ?? '';
        const altLast = alt.lastName ?? '';
        let altName = altGiven ? `${altGiven} /${altLast}/` : `/${altLast}/`;
        if (alt.suffix) altName += ` ${alt.suffix}`;
        lines.push(`1 NAME ${altName}`);
        lines.push(`2 TYPE ${alt.type}`);
        if (altGiven) lines.push(`2 GIVN ${altGiven}`);
        if (altLast) lines.push(`2 SURN ${altLast}`);
        if (alt.prefix) lines.push(`2 NPFX ${alt.prefix}`);
        if (alt.suffix) lines.push(`2 NSFX ${alt.suffix}`);
      }
    }

    lines.push(`1 SEX ${genderToGedcom(person.gender)}`);

    // Birth
    if (person.birthDate || person.birthPlace) {
      lines.push('1 BIRT');
      if (person.birthDate) {
        const dateStr = toGedcomDate(person.birthDate);
        const prefix = person.birthDateQualifier ? `${person.birthDateQualifier} ` : '';
        lines.push(`2 DATE ${prefix}${dateStr}`);
      }
      if (person.birthPlace) lines.push(`2 PLAC ${person.birthPlace}`);
      appendCitations(lines, person.citations, 'BIRT', sourceToPointer, 2);
    }

    // Death
    if (person.deathDate || person.deathPlace) {
      lines.push('1 DEAT');
      if (person.deathDate) {
        const dateStr = toGedcomDate(person.deathDate);
        const prefix = person.deathDateQualifier ? `${person.deathDateQualifier} ` : '';
        lines.push(`2 DATE ${prefix}${dateStr}`);
      }
      if (person.deathPlace) lines.push(`2 PLAC ${person.deathPlace}`);
      appendCitations(lines, person.citations, 'DEAT', sourceToPointer, 2);
    }

    // Burial
    if (person.burialPlace) {
      lines.push('1 BURI');
      lines.push(`2 PLAC ${person.burialPlace}`);
      appendCitations(lines, person.citations, 'BURI', sourceToPointer, 2);
    }

    // Additional events
    const eventArtifactIds = new Set<string>();
    if (person.events) {
      for (const evt of person.events) {
        if (evt.detail) {
          lines.push(`1 ${evt.type} ${evt.detail}`);
        } else {
          lines.push(`1 ${evt.type}`);
        }
        if (evt.date) {
          const dateStr = toGedcomDate(evt.date);
          const prefix = evt.dateQualifier ? `${evt.dateQualifier} ` : '';
          lines.push(`2 DATE ${prefix}${dateStr}`);
        }
        if (evt.place) lines.push(`2 PLAC ${evt.place}`);
        // Nest OBJE under event if linked to an artifact
        if (evt.artifactId) {
          const objePtr = artifactToPointer.get(evt.artifactId);
          if (objePtr) {
            lines.push(`2 OBJE ${objePtr}`);
            eventArtifactIds.add(evt.artifactId);
          }
        }
      }
    }

    // Biography as NOTE
    if (person.biography) {
      lines.push(...wrapText(1, 'NOTE', person.biography));
    }

    // General citations
    appendCitations(lines, person.citations, 'GENERAL', sourceToPointer, 1);

    // Linked artifacts as OBJE references (skip those already nested under events)
    const personArtifacts = artifacts.filter((a) => a.personId === person.personId);
    for (const art of personArtifacts) {
      if (eventArtifactIds.has(art.artifactId)) continue;
      const objePtr = artifactToPointer.get(art.artifactId);
      if (objePtr) lines.push(`1 OBJE ${objePtr}`);
    }

    // Family links
    for (const [famKey, famPointer] of famPointers.entries()) {
      const family = families.get(famKey) as Family;
      if (family.spouse1Id === person.personId || family.spouse2Id === person.personId) {
        lines.push(`1 FAMS ${famPointer}`);
      }
      if (family.childIds.includes(person.personId)) {
        lines.push(`1 FAMC ${famPointer}`);
      }
    }
  }

  // ── FAM records ──
  for (const [famKey, family] of families.entries()) {
    const famPointer = famPointers.get(famKey) as string;
    lines.push(`0 ${famPointer} FAM`);

    if (family.spouse1Id) {
      const ptr = personToPointer.get(family.spouse1Id);
      if (ptr) lines.push(`1 HUSB ${ptr}`);
    }
    if (family.spouse2Id) {
      const ptr = personToPointer.get(family.spouse2Id);
      if (ptr) lines.push(`1 WIFE ${ptr}`);
    }
    for (const childId of family.childIds) {
      const ptr = personToPointer.get(childId);
      if (ptr) lines.push(`1 CHIL ${ptr}`);
    }
    if (family.marriageDate || family.marriagePlace) {
      lines.push('1 MARR');
      if (family.marriageDate) {
        const dateStr = toGedcomDate(family.marriageDate);
        const prefix = family.marriageDateQualifier ? `${family.marriageDateQualifier} ` : '';
        if (dateStr) lines.push(`2 DATE ${prefix}${dateStr}`);
      }
      if (family.marriagePlace) lines.push(`2 PLAC ${family.marriagePlace}`);
    }
    if (family.divorceDate || family.divorcePlace) {
      lines.push('1 DIV');
      if (family.divorceDate) {
        const dateStr = toGedcomDate(family.divorceDate);
        const prefix = family.divorceDateQualifier ? `${family.divorceDateQualifier} ` : '';
        if (dateStr) lines.push(`2 DATE ${prefix}${dateStr}`);
      }
      if (family.divorcePlace) lines.push(`2 PLAC ${family.divorcePlace}`);
    }
  }

  // ── Trailer ──
  lines.push('0 TRLR');

  return lines.join('\n');
}

// ── Helpers ──

function appendCitations(
  lines: string[],
  citations: Person['citations'],
  eventType: string,
  sourceToPointer: Map<string, string>,
  level: number,
): void {
  if (!citations) return;
  for (const cit of citations) {
    if (cit.eventType !== eventType) continue;
    const ptr = sourceToPointer.get(cit.sourceId);
    if (!ptr) continue;
    lines.push(`${level} SOUR ${ptr}`);
    if (cit.page) lines.push(`${level + 1} PAGE ${cit.page}`);
    if (cit.detail) {
      lines.push(`${level + 1} DATA`);
      lines.push(...wrapText(level + 2, 'TEXT', cit.detail));
    }
  }
}

function mimeToForm(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'image/jpeg',
    'image/png': 'image/png',
    'image/webp': 'image/webp',
    'application/pdf': 'application/pdf',
  };
  return map[contentType] ?? contentType;
}

function artifactTypeToMedia(artifactType: string): string {
  switch (artifactType) {
    case 'PHOTO': return 'photo';
    case 'GRAVE': return 'tombstone';
    case 'BIRTH_RECORD': return 'document';
    case 'DEATH_RECORD': return 'document';
    case 'MARRIAGE_RECORD': return 'document';
    case 'DIVORCE_RECORD': return 'document';
    case 'CENSUS_RECORD': return 'document';
    case 'IMMIGRATION_RECORD': return 'document';
    default: return 'other';
  }
}

function buildFamilies(
  relationships: Relationship[],
  people: Map<string, Person>,
): Map<string, Family> {
  const families = new Map<string, Family>();

  // Spouse relationships define families
  const spouseRels = relationships.filter((r) => r.relationshipType === 'SPOUSE');
  for (const rel of spouseRels) {
    const famKey = [rel.person1Id, rel.person2Id].sort().join('#');
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

  // Parent-child relationships add children to families
  const parentChildRels = relationships.filter((r) => r.relationshipType === 'PARENT_CHILD');
  const parentToChildren = new Map<string, string[]>();
  for (const rel of parentChildRels) {
    const children = parentToChildren.get(rel.person1Id) || [];
    children.push(rel.person2Id);
    parentToChildren.set(rel.person1Id, children);
  }

  // Add children to existing families
  for (const [, family] of families.entries()) {
    const children1 = family.spouse1Id ? parentToChildren.get(family.spouse1Id) || [] : [];
    const children2 = family.spouse2Id ? parentToChildren.get(family.spouse2Id) || [] : [];
    const commonChildren = children1.filter((c) => children2.includes(c));
    family.childIds = [...new Set(commonChildren)];
  }

  // Handle single-parent families
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
