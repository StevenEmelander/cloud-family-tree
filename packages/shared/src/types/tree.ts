export interface GedcomImportResult {
  peopleAdded: number;
  peopleSkipped: number;
  peopleUpdated: number;
  relationshipsAdded: number;
  relationshipsSkipped: number;
  photosAdded: number;
  errors: string[];
  warnings: string[];
}

export interface GedcomExportResult {
  gedcomContent: string;
  peopleExported: number;
  relationshipsExported: number;
  exportedAt: string; // ISO timestamp
}
