export enum ArtifactType {
  PHOTO = 'PHOTO',
  GRAVE = 'GRAVE',
  BIRTH_RECORD = 'BIRTH_RECORD',
  DEATH_RECORD = 'DEATH_RECORD',
  MARRIAGE_RECORD = 'MARRIAGE_RECORD',
  DIVORCE_RECORD = 'DIVORCE_RECORD',
  CENSUS_RECORD = 'CENSUS_RECORD',
  IMMIGRATION_RECORD = 'IMMIGRATION_RECORD',
  OTHER = 'OTHER',
}

export interface Artifact {
  artifactId: string;
  personId: string;
  artifactType: ArtifactType;
  s3Bucket: string;
  s3Key: string;
  fileName: string;
  fileSize: number; // bytes
  contentType: string; // MIME type
  caption?: string;
  source?: string;
  date?: string; // flex date for the record itself (YYYY or YYYY-MM-DD)
  isPrimary: boolean; // profile photo?
  metadata?: Record<string, string>; // type-specific fields (e.g. shipName, portOfArrival, censusLocation)
  uploadedAt: string; // ISO timestamp
  uploadedBy: string; // User ID
}

export interface CreateArtifactInput {
  personId: string;
  artifactType?: ArtifactType;
  fileName: string;
  fileSize: number;
  contentType: string;
  caption?: string;
  source?: string;
  date?: string;
  isPrimary?: boolean;
  metadata?: Record<string, string>;
}

export interface UpdateArtifactInput {
  caption?: string;
  source?: string;
  date?: string;
  isPrimary?: boolean;
  metadata?: Record<string, string>;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  s3Key: string;
  expiresAt: string; // ISO timestamp
}
