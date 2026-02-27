export interface GedcomImportResult {
  peopleAdded: number;
  peopleSkipped: number;
  peopleUpdated: number;
  relationshipsAdded: number;
  relationshipsSkipped: number;
  sourcesAdded: number;
  sourcesSkipped: number;
  artifactsAdded: number;
  artifactsSkipped: number;
  entriesAdded?: number;
  errors: string[];
  warnings: string[];
}

export interface GedcomExportResult {
  gedcomContent: string;
  peopleExported: number;
  relationshipsExported: number;
  sourcesExported: number;
  artifactsExported: number;
  exportedAt: string; // ISO timestamp
  gedzipUrl?: string; // presigned S3 URL for GEDZIP download
}
