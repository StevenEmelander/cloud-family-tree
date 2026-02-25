import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createArtifactSchema, updateArtifactSchema } from '../../src/schemas/artifact.schema';
import { ArtifactType } from '../../src/types/artifact';

describe('createArtifactSchema', () => {
  const validInput = {
    personId: randomUUID(),
    fileName: 'photo.jpg',
    fileSize: 1024,
    contentType: 'image/jpeg',
  };

  it('accepts valid minimal input with default artifactType', () => {
    const result = createArtifactSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.artifactType).toBe(ArtifactType.PHOTO);
    }
  });

  it('accepts full input with all optional fields', () => {
    const result = createArtifactSchema.safeParse({
      ...validInput,
      artifactType: ArtifactType.PHOTO,
      caption: 'Family reunion',
      source: 'Personal archive',
      date: '1995-06-15',
      isPrimary: true,
      metadata: { location: 'Chicago' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts image types for PHOTO', () => {
    for (const contentType of ['image/jpeg', 'image/png', 'image/webp']) {
      const result = createArtifactSchema.safeParse({ ...validInput, contentType });
      expect(result.success).toBe(true);
    }
  });

  it('accepts PDF for document artifact types', () => {
    const docTypes = [
      ArtifactType.BIRTH_RECORD,
      ArtifactType.DEATH_RECORD,
      ArtifactType.MARRIAGE_RECORD,
      ArtifactType.CENSUS_RECORD,
      ArtifactType.OTHER,
    ];
    for (const artifactType of docTypes) {
      const result = createArtifactSchema.safeParse({
        ...validInput,
        artifactType,
        contentType: 'application/pdf',
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects PDF for PHOTO type', () => {
    const result = createArtifactSchema.safeParse({
      ...validInput,
      artifactType: ArtifactType.PHOTO,
      contentType: 'application/pdf',
    });
    expect(result.success).toBe(false);
  });

  it('rejects PDF for GRAVE type', () => {
    const result = createArtifactSchema.safeParse({
      ...validInput,
      artifactType: ArtifactType.GRAVE,
      contentType: 'application/pdf',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid content type', () => {
    const result = createArtifactSchema.safeParse({ ...validInput, contentType: 'text/plain' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid personId', () => {
    const result = createArtifactSchema.safeParse({ ...validInput, personId: 'bad-id' });
    expect(result.success).toBe(false);
  });

  it('rejects empty fileName', () => {
    const result = createArtifactSchema.safeParse({ ...validInput, fileName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects zero fileSize', () => {
    const result = createArtifactSchema.safeParse({ ...validInput, fileSize: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects fileSize over 5MB', () => {
    const result = createArtifactSchema.safeParse({ ...validInput, fileSize: 6 * 1024 * 1024 });
    expect(result.success).toBe(false);
  });

  it('accepts flex date formats', () => {
    for (const date of ['1990', '1990-05', '1990-05-15']) {
      const result = createArtifactSchema.safeParse({ ...validInput, date });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid date format', () => {
    const result = createArtifactSchema.safeParse({ ...validInput, date: '15/05/1990' });
    expect(result.success).toBe(false);
  });

  it('rejects semantically invalid date', () => {
    const result = createArtifactSchema.safeParse({ ...validInput, date: '1990-13' });
    expect(result.success).toBe(false);
  });

  it('rejects caption over 500 chars', () => {
    const result = createArtifactSchema.safeParse({ ...validInput, caption: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });
});

describe('updateArtifactSchema', () => {
  it('accepts partial updates', () => {
    const result = updateArtifactSchema.safeParse({ caption: 'Updated caption' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateArtifactSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('transforms empty string caption to undefined', () => {
    const result = updateArtifactSchema.safeParse({ caption: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.caption).toBeUndefined();
    }
  });

  it('transforms empty string date to undefined', () => {
    const result = updateArtifactSchema.safeParse({ date: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date).toBeUndefined();
    }
  });

  it('accepts valid flex date', () => {
    const result = updateArtifactSchema.safeParse({ date: '2020-06' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date format', () => {
    const result = updateArtifactSchema.safeParse({ date: 'June 2020' });
    expect(result.success).toBe(false);
  });

  it('rejects semantically invalid date', () => {
    const result = updateArtifactSchema.safeParse({ date: '2020-02-30' });
    expect(result.success).toBe(false);
  });
});
