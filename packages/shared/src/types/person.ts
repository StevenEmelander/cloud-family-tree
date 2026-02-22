export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  UNKNOWN = 'UNKNOWN',
}

export enum DateQualifier {
  ABT = 'ABT', // About / approximately
  BEF = 'BEF', // Before
  AFT = 'AFT', // After
  EST = 'EST', // Estimated
  CAL = 'CAL', // Calculated
}

export interface Person {
  personId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  birthDate?: string; // YYYY, YYYY-MM, or YYYY-MM-DD
  birthDateQualifier?: DateQualifier;
  birthPlace?: string;
  deathDate?: string; // YYYY, YYYY-MM, or YYYY-MM-DD
  deathDateQualifier?: DateQualifier;
  deathPlace?: string;
  burialPlace?: string;
  gender: Gender;
  biography?: string;
  profilePhotoS3Key?: string;
  gedcomId?: string; // GEDCOM pointer (e.g. @I137@) for re-import matching
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface CreatePersonInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  birthDate?: string;
  birthDateQualifier?: DateQualifier;
  birthPlace?: string;
  deathDate?: string;
  deathDateQualifier?: DateQualifier;
  deathPlace?: string;
  burialPlace?: string;
  gender: Gender;
  biography?: string;
}

export interface UpdatePersonInput {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  birthDate?: string;
  birthDateQualifier?: DateQualifier;
  birthPlace?: string;
  deathDate?: string;
  deathDateQualifier?: DateQualifier;
  deathPlace?: string;
  burialPlace?: string;
  gender?: Gender;
  biography?: string;
  profilePhotoS3Key?: string;
}
