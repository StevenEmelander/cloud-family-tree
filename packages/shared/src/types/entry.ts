export type EntryType = 'wall' | 'issue' | 'bug';

export interface Entry {
  entryId: string;
  personId: string;
  authorId: string; // Cognito userId (sub)
  authorName: string; // Display name at time of writing
  content: string; // Max 2000 chars
  entryType?: EntryType; // undefined treated as 'wall' for backwards compat
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface CreateEntryInput {
  personId: string;
  content: string;
  entryType?: EntryType;
}

export interface UpdateEntryInput {
  content: string;
}
