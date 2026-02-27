import type {
  AdminUserListItem,
  Artifact,
  CreateSourceInput,
  Entry,
  GedcomImportResult,
  Person,
  PresignedUrlResponse,
  Relationship,
  Source,
  UpdateSourceInput,
} from '@cloud-family-tree/shared';
import { getIdToken } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ApiValidationError extends Error {
  fieldErrors: Record<string, string>;

  constructor(message: string, errors?: string[]) {
    super(message);
    this.name = 'ApiValidationError';
    this.fieldErrors = {};
    if (errors) {
      for (const err of errors) {
        // Format: "fieldName: message" or "fieldName.sub: message"
        const colonIdx = err.indexOf(': ');
        if (colonIdx > 0) {
          const field = err.slice(0, colonIdx).split('.')[0] ?? '';
          this.fieldErrors[field] = err.slice(colonIdx + 2);
        }
      }
    }
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  const token = await getIdToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.errors && Array.isArray(body.errors)) {
      throw new ApiValidationError(body.errors.join('; '), body.errors);
    }
    throw new Error(body.error || body.message || `API error: ${res.status}`);
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }

  const json = await res.json();
  // API wraps successful responses in { data: ... }
  return json.data ?? json;
}

export const api = {
  // People
  listPeople: (params?: { limit?: number; cursor?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.search) query.set('search', params.search);
    const qs = query.toString();
    return apiFetch<{ items: Person[]; count: number; lastEvaluatedKey?: string }>(
      `/people${qs ? `?${qs}` : ''}`,
    );
  },

  getPerson: (id: string) => apiFetch<Person>(`/people/${id}`),

  createPerson: (data: Record<string, unknown>) =>
    apiFetch<Person>('/people', { method: 'POST', body: JSON.stringify(data) }),

  updatePerson: (id: string, data: Record<string, unknown>) =>
    apiFetch<Person>(`/people/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deletePerson: (id: string) => apiFetch<void>(`/people/${id}`, { method: 'DELETE' }),

  // Relationships
  getPersonDetail: (personId: string) =>
    apiFetch<{
      person: Person;
      items: Relationship[];
      count: number;
      otherParent: Record<string, string>;
      spouseParents: Record<string, string[]>;
      parentMarriages: Record<string, { marriageDate?: string; divorceDate?: string }>;
      relatedPeople: Record<
        string,
        { name: string; gender: string; birthDate?: string; deathDate?: string }
      >;
    }>(`/people/${personId}/relationships?view=family-tree`),

  createRelationship: (data: Record<string, unknown>) =>
    apiFetch<Relationship>('/relationships', { method: 'POST', body: JSON.stringify(data) }),

  deleteRelationship: (id: string) => apiFetch<void>(`/relationships/${id}`, { method: 'DELETE' }),

  updateRelationship: (id: string, data: Record<string, unknown>) =>
    apiFetch<Relationship>(`/relationships/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Tree
  importGedcom: (gedcomContent: string) =>
    apiFetch<GedcomImportResult>('/tree/import-gedcom', {
      method: 'POST',
      body: JSON.stringify({ gedcom: gedcomContent }),
    }),

  exportGedcom: () => apiFetch<{ gedcom: string }>('/tree/export-gedcom'),

  // GEDZIP
  exportGedzip: () =>
    apiFetch<{ downloadUrl: string; peopleExported: number; artifactsExported: number }>(
      '/tree/export-gedzip',
      { method: 'POST' },
    ),

  getGedzipUploadUrl: () =>
    apiFetch<{ s3Key: string; uploadUrl: string }>('/tree/upload-gedzip', { method: 'POST' }),

  importGedzip: (s3Key: string) =>
    apiFetch<GedcomImportResult>('/tree/import-gedzip', {
      method: 'POST',
      body: JSON.stringify({ s3Key }),
    }),

  // Sources
  listSources: () => apiFetch<{ items: Source[]; count: number }>('/sources'),

  getSource: (id: string) => apiFetch<Source>(`/sources/${id}`),

  createSource: (data: CreateSourceInput) =>
    apiFetch<Source>('/sources', { method: 'POST', body: JSON.stringify(data) }),

  updateSource: (id: string, data: UpdateSourceInput) =>
    apiFetch<Source>(`/sources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteSource: (id: string) => apiFetch<void>(`/sources/${id}`, { method: 'DELETE' }),

  // Admin
  listUsers: () => apiFetch<{ users: AdminUserListItem[] }>('/admin/users'),

  approveUser: (username: string) =>
    apiFetch<void>('/admin/users/approve', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  deleteUser: (username: string) =>
    apiFetch<void>(`/admin/users/${username}`, { method: 'DELETE' }),

  setUserRole: (username: string, role: 'admin' | 'editor' | 'visitor') =>
    apiFetch<void>('/admin/users/set-role', {
      method: 'POST',
      body: JSON.stringify({ username, role }),
    }),

  requestEditor: () =>
    apiFetch<{ message: string }>('/admin/users/request-editor', { method: 'POST' }),

  // Artifacts
  listArtifacts: (personId: string) =>
    apiFetch<{ items: Artifact[]; count: number }>(`/people/${personId}/artifacts`),

  createArtifactUploadUrl: (data: Record<string, unknown>) =>
    apiFetch<PresignedUrlResponse>('/artifacts/upload-url', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  confirmArtifactUpload: (data: Record<string, unknown>) =>
    apiFetch<Artifact>('/artifacts/confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getArtifactUrl: (artifactId: string, personId: string) =>
    apiFetch<{ url: string }>(`/artifacts/${artifactId}/url?personId=${personId}`),

  updateArtifact: (artifactId: string, personId: string, data: Record<string, unknown>) =>
    apiFetch<Artifact>(`/artifacts/${artifactId}?personId=${personId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteArtifact: (artifactId: string, personId: string) =>
    apiFetch<void>(`/artifacts/${artifactId}?personId=${personId}`, { method: 'DELETE' }),

  associateArtifact: (
    artifactId: string,
    data: { sourcePersonId: string; targetPersonIds: string[] },
  ) =>
    apiFetch<{ message: string }>(`/artifacts/${artifactId}/associate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  disassociateArtifact: (artifactId: string, personId: string) =>
    apiFetch<void>(`/artifacts/${artifactId}/associate/${personId}`, { method: 'DELETE' }),

  getArtifactAssociations: (artifactId: string, personId: string) =>
    apiFetch<{ associations: { personId: string; name: string }[] }>(
      `/artifacts/${artifactId}/associations?personId=${personId}`,
    ),

  // Entries
  listEntries: (personId: string, type?: string) => {
    const query = new URLSearchParams();
    if (type) query.set('type', type);
    const qs = query.toString();
    return apiFetch<{ items: Entry[]; count: number }>(
      `/people/${personId}/entries${qs ? `?${qs}` : ''}`,
    );
  },

  listAllEntries: (params?: { limit?: number; cursor?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    const qs = query.toString();
    return apiFetch<{ items: Entry[]; count: number; lastEvaluatedKey?: string }>(
      `/entries${qs ? `?${qs}` : ''}`,
    );
  },

  createEntry: (personId: string, content: string, entryType?: string) =>
    apiFetch<Entry>(`/people/${personId}/entries`, {
      method: 'POST',
      body: JSON.stringify({ content, entryType }),
    }),

  updateEntry: (entryId: string, personId: string, content: string) =>
    apiFetch<Entry>(`/entries/${entryId}?personId=${personId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  deleteEntry: (entryId: string, personId: string) =>
    apiFetch<void>(`/entries/${entryId}?personId=${personId}`, { method: 'DELETE' }),
};
