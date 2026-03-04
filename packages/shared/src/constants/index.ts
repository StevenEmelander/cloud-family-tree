// DynamoDB GSI Names
export const GSI_NAMES = {
  PEOPLE_NAME_INDEX: 'NameIndex',
  RELATIONSHIPS_PERSON_INDEX: 'PersonIndex',
  RELATIONSHIPS_INVERSE_PERSON_INDEX: 'InversePersonIndex',
  ARTIFACT_PERSON_INDEX: 'PersonArtifactsIndex',
  ENTRIES_PERSON_INDEX: 'PersonEntriesIndex',
  SOURCES_TITLE_INDEX: 'TitleIndex',
} as const;

// DynamoDB Entity Prefixes for composite keys
export const ENTITY_PREFIX = {
  RELATIONSHIP: 'RELATIONSHIP',
  ARTIFACT: 'ARTIFACT',
  PERSON: 'PERSON',
  TYPE: 'TYPE',
  LASTNAME: 'LASTNAME',
  FIRSTNAME: 'FIRSTNAME',
  UPLOADED: 'UPLOADED',
  METADATA: 'METADATA',
  ENTRY: 'ENTRY',
  SOURCE: 'SOURCE',
  TITLE: 'TITLE',
} as const;

// API Configuration
export const API_CONFIG = {
  MAX_GEDCOM_FILE_SIZE_MB: 10,
  MAX_GEDZIP_FILE_SIZE_MB: 200,
  MAX_ARTIFACT_FILE_SIZE_MB: 5,
  PRESIGNED_URL_EXPIRY_SECONDS: 300, // 5 minutes
  VIEW_URL_EXPIRY_SECONDS: 3600, // 1 hour
  PAGINATION_DEFAULT_LIMIT: 100,
  PAGINATION_MAX_LIMIT: 1000,
  MAX_ANCESTOR_DEPTH: 20,
  MAX_DESCENDANT_DEPTH: 20,
} as const;

// Maps ArtifactType to GEDCOM event tag for auto-event creation on linked persons
export const ARTIFACT_TYPE_TO_EVENT_TAG: Record<string, string> = {
  GRAVE: 'BURI',
  CENSUS_RECORD: 'CENS',
  IMMIGRATION_RECORD: 'IMMI',
};

// Cursor HMAC signing secret for pagination tokens
export const CURSOR_HMAC_SECRET = process.env.CURSOR_HMAC_SECRET || 'cloud-family-tree-cursor-v1';

// Artifact Configuration
export const ARTIFACT_CONFIG = {
  ALLOWED_IMAGE_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const,
  ALLOWED_EXTENSIONS: ['jpg', 'jpeg', 'png', 'webp', 'pdf'] as const,
  MIME_TO_EXTENSIONS: {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'application/pdf': ['pdf'],
  } as const,
} as const;
