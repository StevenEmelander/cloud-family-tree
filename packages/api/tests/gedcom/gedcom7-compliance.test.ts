import type { Artifact, Person, Relationship, Source } from '@cloud-family-tree/shared';
import { Gender, RelationshipType } from '@cloud-family-tree/shared';
import { describe, expect, it } from 'vitest';
import { generateGedcom7, toGedcomDate } from '../../src/gedcom/gedcom7/generator';
import { buildTree, parseGedcom, parseLines, childValue, findChild, findChildren, getRecordsByTag } from '../../src/gedcom/gedcom7/parser';

// ── Test data factories ──

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    personId: 'p-1',
    firstName: 'John',
    middleName: 'Michael',
    lastName: 'Doe',
    gender: Gender.MALE,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    sourceId: 's-1',
    title: 'Birth Records of Springfield',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    artifactId: 'a-1',
    personId: 'p-1',
    artifactType: 'PHOTO',
    s3Bucket: 'test-bucket',
    s3Key: 'artifacts/p-1/a-1.jpg',
    fileName: 'photo.jpg',
    fileSize: 12345,
    contentType: 'image/jpeg',
    isPrimary: false,
    uploadedAt: '2024-01-01T00:00:00.000Z',
    uploadedBy: 'user-1',
    ...overrides,
  };
}

function generate(opts: {
  people?: Person[];
  relationships?: Relationship[];
  sources?: Source[];
  artifacts?: Artifact[];
  artifactFilePaths?: Map<string, string>;
}): string {
  return generateGedcom7({
    people: opts.people ?? [],
    relationships: opts.relationships ?? [],
    sources: opts.sources ?? [],
    artifacts: opts.artifacts ?? [],
    artifactFilePaths: opts.artifactFilePaths,
  });
}

function getLines(gedcom: string): string[] {
  return gedcom.split('\n');
}

function findLine(lines: string[], pattern: RegExp | string): string | undefined {
  if (typeof pattern === 'string') return lines.find((l) => l.includes(pattern));
  return lines.find((l) => pattern.test(l));
}

function findLineIndex(lines: string[], pattern: RegExp | string): number {
  if (typeof pattern === 'string') return lines.findIndex((l) => l.includes(pattern));
  return lines.findIndex((l) => pattern.test(l));
}

// ── Tests ──

describe('GEDCOM 7 compliance', () => {
  describe('HEAD structure', () => {
    it('starts with 0 HEAD and ends with 0 TRLR', () => {
      const lines = getLines(generate({}));
      expect(lines[0]).toBe('0 HEAD');
      expect(lines[lines.length - 1]).toBe('0 TRLR');
    });

    it('includes GEDC with VERS 7.0', () => {
      const lines = getLines(generate({}));
      const gedcIdx = findLineIndex(lines, '1 GEDC');
      expect(gedcIdx).toBeGreaterThan(0);
      expect(lines[gedcIdx + 1]).toBe('2 VERS 7.0');
    });

    it('includes SOUR with product name and version', () => {
      const gedcom = generate({});
      expect(gedcom).toContain('1 SOUR CloudFamilyTree');
      expect(gedcom).toContain('2 VERS 0.2.0');
    });

    it('includes SCHMA with _PRIM URI when primary artifacts exist', () => {
      const gedcom = generate({
        artifacts: [makeArtifact({ isPrimary: true })],
      });
      const lines = getLines(gedcom);
      expect(findLine(lines, '1 SCHMA')).toBeTruthy();
      expect(findLine(lines, /^2 TAG _PRIM /)).toBeTruthy();
    });

    it('omits SCHMA when no extension tags are used', () => {
      const gedcom = generate({
        people: [makePerson()],
      });
      expect(gedcom).not.toContain('1 SCHMA');
    });

    it('includes DATE in header', () => {
      const gedcom = generate({});
      expect(gedcom).toMatch(/^1 DATE \d{1,2} [A-Z]{3} \d{4}$/m);
    });
  });

  describe('SOUR records', () => {
    it('generates valid SOUR with TITL, AUTH, PUBL', () => {
      const source = makeSource({
        author: 'County Clerk',
        publicationInfo: 'Springfield Records Office, 1990',
      });
      const gedcom = generate({ sources: [source] });
      expect(gedcom).toContain('0 @S1@ SOUR');
      expect(gedcom).toContain('1 TITL Birth Records of Springfield');
      expect(gedcom).toContain('1 AUTH County Clerk');
      expect(gedcom).toContain('1 PUBL Springfield Records Office, 1990');
    });

    it('generates separate REPO record and uses pointer from SOUR', () => {
      const source = makeSource({ repositoryName: 'Illinois State Archives' });
      const gedcom = generate({ sources: [source] });
      const lines = getLines(gedcom);

      // Separate REPO record exists
      expect(findLine(lines, /^0 @R\d+@ REPO$/)).toBeTruthy();
      expect(findLine(lines, '1 NAME Illinois State Archives')).toBeTruthy();

      // SOUR references REPO via pointer (not inline)
      const repoRef = findLine(lines, /^1 REPO @R\d+@$/);
      expect(repoRef).toBeTruthy();

      // No inline NAME under REPO in SOUR
      const sourIdx = findLineIndex(lines, '0 @S1@ SOUR');
      const repoInSour = findLineIndex(lines, repoRef!);
      expect(repoInSour).toBeGreaterThan(sourIdx);
    });

    it('places URL on REPO ADDR.WWW, not SOUR.WWW', () => {
      const source = makeSource({
        repositoryName: 'Archives',
        url: 'https://archives.example.com',
      });
      const gedcom = generate({ sources: [source] });
      const lines = getLines(gedcom);

      // URL is under REPO > ADDR > WWW
      const repoIdx = findLineIndex(lines, /^0 @R\d+@ REPO$/);
      expect(repoIdx).toBeGreaterThan(-1);
      expect(findLine(lines, '1 ADDR')).toBeTruthy();
      expect(findLine(lines, '2 WWW https://archives.example.com')).toBeTruthy();

      // No WWW directly under SOUR
      const sourIdx = findLineIndex(lines, '0 @S1@ SOUR');
      const trlrIdx = findLineIndex(lines, '0 TRLR');
      const sourLines = lines.slice(sourIdx, trlrIdx);
      const wwwInSour = sourLines.find((l) => l === '1 WWW https://archives.example.com');
      expect(wwwInSour).toBeUndefined();
    });

    it('puts URL in NOTE when no repository exists', () => {
      const source = makeSource({ url: 'https://example.com/records' });
      const gedcom = generate({ sources: [source] });
      expect(gedcom).toContain('1 NOTE URL: https://example.com/records');
    });

    it('deduplicates REPO records for same repository name', () => {
      const sources = [
        makeSource({ sourceId: 's-1', repositoryName: 'Archives' }),
        makeSource({ sourceId: 's-2', title: 'Another Record', repositoryName: 'Archives' }),
      ];
      const gedcom = generate({ sources });
      const lines = getLines(gedcom);
      const repoLines = lines.filter((l) => /^0 @R\d+@ REPO$/.test(l));
      expect(repoLines.length).toBe(1);
    });

    it('generates NOTE with CONT for multi-line notes', () => {
      const source = makeSource({ notes: 'Line one\nLine two\nLine three' });
      const gedcom = generate({ sources: [source] });
      expect(gedcom).toContain('1 NOTE Line one');
      expect(gedcom).toContain('2 CONT Line two');
      expect(gedcom).toContain('2 CONT Line three');
    });
  });

  describe('OBJE records', () => {
    it('nests FORM under FILE and MEDI under FORM (GEDCOM 7 hierarchy)', () => {
      const artifact = makeArtifact();
      const gedcom = generate({ artifacts: [artifact] });
      const lines = getLines(gedcom);

      const fileIdx = findLineIndex(lines, '1 FILE photo.jpg');
      expect(fileIdx).toBeGreaterThan(-1);
      expect(lines[fileIdx + 1]).toBe('2 FORM image/jpeg');
      expect(lines[fileIdx + 2]).toBe('3 MEDI photo');
    });

    it('nests TITL under FILE (level 2), not OBJE (level 1)', () => {
      const artifact = makeArtifact({ caption: 'Family portrait' });
      const gedcom = generate({ artifacts: [artifact] });
      const lines = getLines(gedcom);

      // TITL should be level 2 (under FILE)
      expect(findLine(lines, '2 TITL Family portrait')).toBeTruthy();
      // Should NOT have level 1 TITL
      expect(findLine(lines, '1 TITL Family portrait')).toBeUndefined();
    });

    it('does not emit bare DATE under OBJE', () => {
      const artifact = makeArtifact({ date: '1920-06-15' });
      const gedcom = generate({ artifacts: [artifact] });
      const lines = getLines(gedcom);

      // No bare DATE at level 1 under OBJE
      const objeIdx = findLineIndex(lines, /^0 @O\d+@ OBJE$/);
      const nextRecordIdx = lines.findIndex((l, i) => i > objeIdx && /^0 /.test(l));
      const objeLines = lines.slice(objeIdx, nextRecordIdx);
      expect(objeLines.find((l) => /^1 DATE /.test(l))).toBeUndefined();
    });

    it('maps artifact types to correct MEDI values', () => {
      const types = [
        { artifactType: 'PHOTO', expected: 'photo' },
        { artifactType: 'GRAVE', expected: 'tombstone' },
        { artifactType: 'CENSUS_RECORD', expected: 'document' },
        { artifactType: 'OTHER', expected: 'other' },
      ];
      for (const { artifactType, expected } of types) {
        const gedcom = generate({ artifacts: [makeArtifact({ artifactType: artifactType as Artifact['artifactType'] })] });
        expect(gedcom).toContain(`3 MEDI ${expected}`);
      }
    });

    it('uses artifact file path from map when provided', () => {
      const artifact = makeArtifact({ artifactId: 'a-1' });
      const filePaths = new Map([['a-1', 'media/family-photo.jpg']]);
      const gedcom = generate({ artifacts: [artifact], artifactFilePaths: filePaths });
      expect(gedcom).toContain('1 FILE media/family-photo.jpg');
    });

    it('emits _PRIM Y for primary artifacts', () => {
      const artifact = makeArtifact({ isPrimary: true });
      const gedcom = generate({ artifacts: [artifact] });
      expect(gedcom).toContain('1 _PRIM Y');
    });

    it('does not emit _PRIM for non-primary artifacts', () => {
      const artifact = makeArtifact({ isPrimary: false });
      const gedcom = generate({ artifacts: [artifact] });
      expect(gedcom).not.toContain('_PRIM');
    });
  });

  describe('INDI records', () => {
    it('generates NAME with GIVN, SURN, and optional NPFX/NSFX/NICK', () => {
      const person = makePerson({ prefix: 'Dr.', suffix: 'Jr.', nickname: 'Johnny' });
      const gedcom = generate({ people: [person] });
      expect(gedcom).toContain('1 NAME John Michael /Doe/ Jr.');
      expect(gedcom).toContain('2 GIVN John Michael');
      expect(gedcom).toContain('2 SURN Doe');
      expect(gedcom).toContain('2 NPFX Dr.');
      expect(gedcom).toContain('2 NSFX Jr.');
      expect(gedcom).toContain('2 NICK Johnny');
    });

    it('generates alternate names with TYPE from valid enum', () => {
      const person = makePerson({
        alternateNames: [
          { type: 'AKA' as any, firstName: 'Jane', lastName: 'Smith' },
          { type: 'MARRIED' as any, lastName: 'Johnson' },
        ],
      });
      const gedcom = generate({ people: [person] });
      const lines = getLines(gedcom);

      // First alternate name
      expect(findLine(lines, '1 NAME Jane /Smith/')).toBeTruthy();
      expect(findLine(lines, '2 TYPE AKA')).toBeTruthy();

      // Second alternate name
      expect(findLine(lines, '1 NAME /Johnson/')).toBeTruthy();
      expect(findLine(lines, '2 TYPE MARRIED')).toBeTruthy();
    });

    it('generates SEX with valid values', () => {
      const cases = [
        { gender: Gender.MALE, expected: '1 SEX M' },
        { gender: Gender.FEMALE, expected: '1 SEX F' },
        { gender: Gender.OTHER, expected: '1 SEX X' },
        { gender: Gender.UNKNOWN, expected: '1 SEX U' },
      ];
      for (const { gender, expected } of cases) {
        const gedcom = generate({ people: [makePerson({ gender })] });
        expect(gedcom).toContain(expected);
      }
    });

    it('generates BIRT with DATE and PLAC', () => {
      const person = makePerson({
        birthDate: '1960-03-15',
        birthPlace: 'Springfield, IL',
      });
      const gedcom = generate({ people: [person] });
      expect(gedcom).toContain('1 BIRT');
      expect(gedcom).toContain('2 DATE 15 MAR 1960');
      expect(gedcom).toContain('2 PLAC Springfield, IL');
    });

    it('generates date qualifiers correctly', () => {
      const person = makePerson({
        birthDate: '1960-03-15',
        birthDateQualifier: 'ABT' as any,
      });
      const gedcom = generate({ people: [person] });
      expect(gedcom).toContain('2 DATE ABT 15 MAR 1960');
    });

    it('generates events with proper structure', () => {
      const person = makePerson({
        events: [
          { type: 'IMMI', date: '1881', place: 'New York' },
          { type: 'OCCU', detail: 'Farmer' },
          { type: 'CENS', date: '1900-06' },
        ],
      });
      const gedcom = generate({ people: [person] });
      expect(gedcom).toContain('1 IMMI');
      expect(gedcom).toContain('2 DATE 1881');
      expect(gedcom).toContain('2 PLAC New York');
      expect(gedcom).toContain('1 OCCU Farmer');
      expect(gedcom).toContain('1 CENS');
      expect(gedcom).toContain('2 DATE JUN 1900');
    });

    it('nests OBJE pointer under event when artifactId is set', () => {
      const person = makePerson({
        events: [{ type: 'BURI', artifactId: 'a-1' }],
      });
      const artifact = makeArtifact({ artifactId: 'a-1', personId: 'p-1' });
      const gedcom = generate({ people: [person], artifacts: [artifact] });
      const lines = getLines(gedcom);

      const buriIdx = findLineIndex(lines, '1 BURI');
      expect(buriIdx).toBeGreaterThan(-1);
      expect(lines[buriIdx + 1]).toMatch(/^2 OBJE @O\d+@$/);
    });

    it('skips event-linked artifacts from INDI-level OBJE list', () => {
      const person = makePerson({
        personId: 'p-1',
        events: [{ type: 'BURI', artifactId: 'a-1' }],
      });
      const artifact = makeArtifact({ artifactId: 'a-1', personId: 'p-1' });
      const gedcom = generate({ people: [person], artifacts: [artifact] });
      const lines = getLines(gedcom);

      // OBJE appears at level 2 (under event), not at level 1 (INDI-level)
      const indiObje = lines.filter((l) => /^1 OBJE @O\d+@$/.test(l));
      expect(indiObje.length).toBe(0);
    });

    it('generates NOTE with CONT for multi-line biography', () => {
      const person = makePerson({ biography: 'First paragraph.\nSecond paragraph.' });
      const gedcom = generate({ people: [person] });
      expect(gedcom).toContain('1 NOTE First paragraph.');
      expect(gedcom).toContain('2 CONT Second paragraph.');
    });

    it('generates citations with DATA > TEXT structure', () => {
      const source = makeSource();
      const person = makePerson({
        citations: [{
          sourceId: 's-1',
          eventType: 'BIRT',
          page: 'Page 42',
          detail: 'Born at home',
        }],
        birthDate: '1960-03-15',
      });
      const gedcom = generate({ people: [person], sources: [source] });
      const lines = getLines(gedcom);

      expect(findLine(lines, /^2 SOUR @S\d+@$/)).toBeTruthy();
      expect(findLine(lines, '3 PAGE Page 42')).toBeTruthy();
      expect(findLine(lines, '3 DATA')).toBeTruthy();
      expect(findLine(lines, '4 TEXT Born at home')).toBeTruthy();
    });

    it('does not emit bare DATA with text payload (GEDCOM 5.5.1 style)', () => {
      const source = makeSource();
      const person = makePerson({
        citations: [{ sourceId: 's-1', eventType: 'BIRT', detail: 'Some detail' }],
        birthDate: '1960-01-01',
      });
      const gedcom = generate({ people: [person], sources: [source] });
      // DATA must have no payload text — it's a container
      expect(gedcom).not.toMatch(/^\d+ DATA \S/m);
    });
  });

  describe('FAM records', () => {
    it('generates FAM with HUSB, WIFE, CHIL pointers', () => {
      const people = [
        makePerson({ personId: 'p-1', gender: Gender.MALE }),
        makePerson({ personId: 'p-2', firstName: 'Jane', gender: Gender.FEMALE }),
        makePerson({ personId: 'p-3', firstName: 'Jimmy', gender: Gender.MALE }),
      ];
      const relationships: Relationship[] = [
        { relationshipId: 'r-1', relationshipType: RelationshipType.SPOUSE, person1Id: 'p-1', person2Id: 'p-2', createdAt: '2024-01-01T00:00:00.000Z' },
        { relationshipId: 'r-2', relationshipType: RelationshipType.PARENT_CHILD, person1Id: 'p-1', person2Id: 'p-3', createdAt: '2024-01-01T00:00:00.000Z' },
        { relationshipId: 'r-3', relationshipType: RelationshipType.PARENT_CHILD, person1Id: 'p-2', person2Id: 'p-3', createdAt: '2024-01-01T00:00:00.000Z' },
      ];
      const gedcom = generate({ people, relationships });
      expect(gedcom).toMatch(/^0 @F\d+@ FAM$/m);
      expect(gedcom).toMatch(/^1 HUSB @I\d+@$/m);
      expect(gedcom).toMatch(/^1 WIFE @I\d+@$/m);
      expect(gedcom).toMatch(/^1 CHIL @I\d+@$/m);
    });

    it('generates MARR and DIV with DATE and PLAC', () => {
      const people = [
        makePerson({ personId: 'p-1', gender: Gender.MALE }),
        makePerson({ personId: 'p-2', firstName: 'Jane', gender: Gender.FEMALE }),
      ];
      const relationships: Relationship[] = [{
        relationshipId: 'r-1',
        relationshipType: RelationshipType.SPOUSE,
        person1Id: 'p-1',
        person2Id: 'p-2',
        metadata: {
          marriageDate: '1985-09-10',
          marriagePlace: 'City Hall',
          divorceDate: '2000-01-01',
          divorcePlace: 'Court',
        },
        createdAt: '2024-01-01T00:00:00.000Z',
      }];
      const gedcom = generate({ people, relationships });
      expect(gedcom).toContain('1 MARR');
      expect(gedcom).toContain('2 DATE 10 SEP 1985');
      expect(gedcom).toContain('2 PLAC City Hall');
      expect(gedcom).toContain('1 DIV');
      expect(gedcom).toContain('2 DATE 1 JAN 2000');
      expect(gedcom).toContain('2 PLAC Court');
    });
  });

  describe('no CONC in output', () => {
    it('never emits CONC tag in generated GEDCOM 7', () => {
      const person = makePerson({
        biography: 'A very long biography text.\nWith multiple lines.\nAnd more lines here.',
      });
      const source = makeSource({ notes: 'Multi-line\nnotes here.' });
      const gedcom = generate({ people: [person], sources: [source] });
      expect(gedcom).not.toContain('CONC');
    });
  });

  describe('date formatting', () => {
    it('converts YYYY-MM-DD to DD MON YYYY', () => {
      expect(toGedcomDate('1960-03-15')).toBe('15 MAR 1960');
    });

    it('converts YYYY-MM to MON YYYY', () => {
      expect(toGedcomDate('1960-03')).toBe('MAR 1960');
    });

    it('passes YYYY through unchanged', () => {
      expect(toGedcomDate('1960')).toBe('1960');
    });

    it('returns undefined for invalid months', () => {
      expect(toGedcomDate('1960-13')).toBeUndefined();
      expect(toGedcomDate('1960-00')).toBeUndefined();
    });

    it('returns undefined for undefined input', () => {
      expect(toGedcomDate(undefined)).toBeUndefined();
    });
  });

  describe('record ordering', () => {
    it('outputs HEAD first, then REPO, SOUR, OBJE, INDI, FAM, TRLR', () => {
      const source = makeSource({ repositoryName: 'Archives' });
      const person = makePerson();
      const artifact = makeArtifact();
      const gedcom = generate({ sources: [source], people: [person], artifacts: [artifact] });
      const lines = getLines(gedcom);

      const headIdx = findLineIndex(lines, '0 HEAD');
      const repoIdx = findLineIndex(lines, /^0 @R\d+@ REPO$/);
      const sourIdx = findLineIndex(lines, /^0 @S\d+@ SOUR$/);
      const objeIdx = findLineIndex(lines, /^0 @O\d+@ OBJE$/);
      const indiIdx = findLineIndex(lines, /^0 @I\d+@ INDI$/);
      const trlrIdx = findLineIndex(lines, '0 TRLR');

      expect(headIdx).toBe(0);
      expect(repoIdx).toBeGreaterThan(headIdx);
      expect(sourIdx).toBeGreaterThan(repoIdx);
      expect(objeIdx).toBeGreaterThan(sourIdx);
      expect(indiIdx).toBeGreaterThan(objeIdx);
      expect(trlrIdx).toBe(lines.length - 1);
    });
  });
});

describe('GEDCOM 7 parser compliance', () => {
  describe('CONT handling (GEDCOM 7 multi-line)', () => {
    it('joins CONT lines with newlines', () => {
      const content = '0 HEAD\n1 NOTE First line\n2 CONT Second line\n2 CONT Third line\n0 TRLR';
      const tree = parseGedcom(content);
      const noteNode = findChild(tree.header!, 'NOTE');
      expect(noteNode?.value).toBe('First line\nSecond line\nThird line');
    });
  });

  describe('xref parsing', () => {
    it('parses xref pointers correctly', () => {
      const content = '0 @I1@ INDI\n1 NAME John /Doe/\n0 TRLR';
      const tree = parseGedcom(content);
      expect(tree.records.length).toBe(1);
      expect(tree.records[0]!.xref).toBe('@I1@');
      expect(tree.records[0]!.tag).toBe('INDI');
    });
  });

  describe('OBJE structure parsing', () => {
    it('reads MEDI from FORM child (GEDCOM 7)', () => {
      const content = [
        '0 @O1@ OBJE',
        '1 FILE photo.jpg',
        '2 FORM image/jpeg',
        '3 MEDI photo',
        '2 TITL Caption',
        '0 TRLR',
      ].join('\n');
      const tree = parseGedcom(content);
      const obje = tree.records[0]!;
      const fileNode = findChild(obje, 'FILE');
      expect(fileNode).toBeTruthy();
      const formNode = findChild(fileNode!, 'FORM');
      expect(formNode?.value).toBe('image/jpeg');
      const mediNode = findChild(formNode!, 'MEDI');
      expect(mediNode?.value).toBe('photo');
      const titlNode = findChild(fileNode!, 'TITL');
      expect(titlNode?.value).toBe('Caption');
    });
  });

  describe('SOUR citation parsing', () => {
    it('reads detail from DATA > TEXT (GEDCOM 7)', () => {
      const content = [
        '0 @I1@ INDI',
        '1 BIRT',
        '2 SOUR @S1@',
        '3 PAGE Page 42',
        '3 DATA',
        '4 TEXT Born at home',
        '0 TRLR',
      ].join('\n');
      const tree = parseGedcom(content);
      const indi = tree.records[0]!;
      const birtNode = findChild(indi, 'BIRT');
      const sourRef = findChild(birtNode!, 'SOUR');
      expect(sourRef?.value).toBe('@S1@');
      const pageNode = findChild(sourRef!, 'PAGE');
      expect(pageNode?.value).toBe('Page 42');
      const dataNode = findChild(sourRef!, 'DATA');
      expect(dataNode).toBeTruthy();
      const textNode = findChild(dataNode!, 'TEXT');
      expect(textNode?.value).toBe('Born at home');
    });

  });

  describe('REPO record parsing', () => {
    it('parses REPO records with NAME', () => {
      const content = [
        '0 @R1@ REPO',
        '1 NAME Illinois State Archives',
        '1 ADDR',
        '2 WWW https://archives.example.com',
        '0 @S1@ SOUR',
        '1 TITL Birth Records',
        '1 REPO @R1@',
        '0 TRLR',
      ].join('\n');
      const tree = parseGedcom(content);
      const repos = getRecordsByTag(tree, 'REPO');
      expect(repos.length).toBe(1);
      expect(repos[0]!.xref).toBe('@R1@');
      expect(childValue(repos[0]!, 'NAME')).toBe('Illinois State Archives');

      const sour = getRecordsByTag(tree, 'SOUR')[0]!;
      const repoRef = findChild(sour, 'REPO');
      expect(repoRef?.value).toBe('@R1@');
    });
  });

  describe('round-trip: generate then parse', () => {
    it('preserves person data through generate→parse cycle', () => {
      const person = makePerson({
        birthDate: '1960-03-15',
        birthPlace: 'Springfield',
        deathDate: '2020-06-10',
        biography: 'A good person.\nLoved by all.',
        events: [{ type: 'IMMI', date: '1881', place: 'New York' }],
      });
      const gedcom = generate({ people: [person] });
      const tree = parseGedcom(gedcom);

      const indi = getRecordsByTag(tree, 'INDI')[0]!;
      const nameNode = findChild(indi, 'NAME');
      expect(nameNode?.value).toContain('John Michael /Doe/');

      const birtNode = findChild(indi, 'BIRT');
      expect(childValue(birtNode!, 'DATE')).toBe('15 MAR 1960');
      expect(childValue(birtNode!, 'PLAC')).toBe('Springfield');

      const deatNode = findChild(indi, 'DEAT');
      expect(childValue(deatNode!, 'DATE')).toBe('10 JUN 2020');

      const noteNode = findChild(indi, 'NOTE');
      expect(noteNode?.value).toBe('A good person.\nLoved by all.');

      const immiNode = findChild(indi, 'IMMI');
      expect(immiNode).toBeTruthy();
      expect(childValue(immiNode!, 'DATE')).toBe('1881');
      expect(childValue(immiNode!, 'PLAC')).toBe('New York');
    });

    it('preserves source data through generate→parse cycle', () => {
      const source = makeSource({
        author: 'County Clerk',
        repositoryName: 'Archives',
        url: 'https://example.com',
        notes: 'Important records',
      });
      const gedcom = generate({ sources: [source] });
      const tree = parseGedcom(gedcom);

      const sourRecord = getRecordsByTag(tree, 'SOUR')[0]!;
      expect(childValue(sourRecord, 'TITL')).toBe('Birth Records of Springfield');
      expect(childValue(sourRecord, 'AUTH')).toBe('County Clerk');

      // REPO pointer should resolve
      const repoRef = findChild(sourRecord, 'REPO');
      expect(repoRef?.value).toMatch(/^@R\d+@$/);

      const repoRecord = getRecordsByTag(tree, 'REPO')[0]!;
      expect(childValue(repoRecord, 'NAME')).toBe('Archives');
    });
  });
});
