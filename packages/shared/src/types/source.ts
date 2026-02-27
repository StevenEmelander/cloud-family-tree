import type { DateQualifier } from './person';

export interface Source {
  sourceId: string;
  title: string;
  author?: string;
  publicationInfo?: string;
  repositoryName?: string;
  url?: string;
  notes?: string;
  gedcomId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSourceInput {
  title: string;
  author?: string;
  publicationInfo?: string;
  repositoryName?: string;
  url?: string;
  notes?: string;
}

export interface UpdateSourceInput {
  title?: string;
  author?: string;
  publicationInfo?: string;
  repositoryName?: string;
  url?: string;
  notes?: string;
}

export enum AlternateNameType {
  AKA = 'AKA',
  BIRTH = 'BIRTH',
  MAIDEN = 'MAIDEN',
  MARRIED = 'MARRIED',
  PROFESSIONAL = 'PROFESSIONAL',
  IMMIGRANT = 'IMMIGRANT',
  OTHER = 'OTHER',
}

export interface AlternateName {
  type: AlternateNameType;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  prefix?: string;
}

export interface Citation {
  sourceId: string;
  eventType?: string; // BIRT, DEAT, BURI, GENERAL, etc.
  eventIndex?: number; // disambiguates when multiple events share the same type (e.g. 3 OCCU events)
  page?: string;
  detail?: string;
}

export interface PersonEvent {
  type: string; // GEDCOM tag: CHR, CREM, RESI, OCCU, EDUC, IMMI, EMIG, CENS, etc.
  date?: string;
  dateQualifier?: DateQualifier;
  place?: string;
  detail?: string;
  artifactId?: string; // links this event to its source artifact
}
