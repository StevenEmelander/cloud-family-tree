import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  Artifact,
  ArtifactType,
  AuthenticatedUser,
  CreateArtifactInput,
  PaginatedResponse,
  PresignedUrlResponse,
  UpdateArtifactInput,
} from '@cloud-family-tree/shared';
import {
  API_CONFIG,
  ARTIFACT_CONFIG,
  createArtifactSchema,
  isoNow,
  updateArtifactSchema,
  validate,
} from '@cloud-family-tree/shared';
import { v4 as uuid } from 'uuid';
import { BucketNames, s3Client } from '../lib/s3';
import { ForbiddenError, NotFoundError, ValidationError } from '../middleware/error-handler';
import { ArtifactRepository } from '../repositories/artifact.repository';
import { PersonRepository } from '../repositories/person.repository';

export class ArtifactService {
  private readonly artifactRepo = new ArtifactRepository();
  private readonly personRepo = new PersonRepository();

  async createUploadUrl(input: CreateArtifactInput, userId: string): Promise<PresignedUrlResponse> {
    const result = validate(createArtifactSchema, input);
    if (!result.success) throw new ValidationError(result.errors!);

    const data = result.data!;

    // Verify person exists
    const person = await this.personRepo.findById(data.personId);
    if (!person) throw new NotFoundError('Person', data.personId);

    const artifactId = uuid();
    const extension = data.fileName.split('.').pop()?.toLowerCase() || 'jpg';

    // Validate extension matches the declared content type
    const mimeMap = ARTIFACT_CONFIG.MIME_TO_EXTENSIONS;
    const allowedExtensions = mimeMap[data.contentType as keyof typeof mimeMap] as
      | readonly string[]
      | undefined;
    if (!allowedExtensions || !allowedExtensions.includes(extension)) {
      throw new ValidationError([
        `File extension ".${extension}" does not match content type "${data.contentType}"`,
      ]);
    }

    const s3Key = `artifacts/${data.personId}/${artifactId}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: BucketNames.Photos,
      Key: s3Key,
      ContentType: data.contentType,
      ContentLength: data.fileSize,
      Metadata: {
        artifactId,
        personId: data.personId,
        uploadedBy: userId,
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: API_CONFIG.PRESIGNED_URL_EXPIRY_SECONDS,
    });

    const expiresAt = new Date(
      Date.now() + API_CONFIG.PRESIGNED_URL_EXPIRY_SECONDS * 1000,
    ).toISOString();

    return { uploadUrl, s3Key, expiresAt };
  }

  async confirmUpload(
    input: CreateArtifactInput & { s3Key: string },
    userId: string,
  ): Promise<Artifact> {
    const result = validate(createArtifactSchema, input);
    if (!result.success) throw new ValidationError(result.errors!);

    const data = result.data!;
    const now = isoNow();
    const artifactId = uuid();

    const artifact: Artifact = {
      artifactId,
      personId: data.personId,
      artifactType: data.artifactType as ArtifactType,
      s3Bucket: BucketNames.Photos,
      s3Key: input.s3Key,
      fileName: data.fileName,
      fileSize: data.fileSize,
      contentType: data.contentType,
      caption: data.caption,
      source: data.source,
      date: data.date,
      isPrimary: data.isPrimary || false,
      ...(data.metadata && Object.keys(data.metadata).length > 0
        ? { metadata: data.metadata }
        : {}),
      uploadedAt: now,
      uploadedBy: userId,
    };

    // If this is primary, update the person's profile photo
    if (artifact.isPrimary) {
      await this.personRepo.update(data.personId, {
        profilePhotoS3Key: input.s3Key,
      });
    }

    await this.artifactRepo.create(artifact);
    return artifact;
  }

  async update(
    artifactId: string,
    personId: string,
    input: UpdateArtifactInput,
    user: AuthenticatedUser,
  ): Promise<Artifact> {
    const result = validate(updateArtifactSchema, input);
    if (!result.success) throw new ValidationError(result.errors!);

    const existing = await this.artifactRepo.findById(artifactId, personId);
    if (!existing) throw new NotFoundError('Artifact', artifactId);

    // Only uploader or admins can edit
    if (existing.uploadedBy !== user.userId && user.role !== 'admins') {
      throw new ForbiddenError('You can only edit artifacts you uploaded');
    }

    const data = result.data!;
    const clearableFields = ['caption', 'source', 'date'] as const;
    const updates: Record<string, unknown> = { ...data };

    for (const field of clearableFields) {
      if (field in input && updates[field] === undefined) {
        updates[field] = null; // null triggers REMOVE in DynamoDB
      }
    }

    // Handle metadata: empty object means remove, otherwise set
    if ('metadata' in input) {
      if (!data.metadata || Object.keys(data.metadata).length === 0) {
        updates.metadata = null;
      }
    }

    // Handle isPrimary toggle
    if (data.isPrimary === true && !existing.isPrimary) {
      await this.personRepo.update(personId, {
        profilePhotoS3Key: existing.s3Key,
      });
    }

    await this.artifactRepo.update(artifactId, personId, updates);

    // Also update all association rows if metadata/caption/source/date changed
    const associations = await this.artifactRepo.findAllAssociations(artifactId);
    for (const assoc of associations) {
      if (assoc.personId !== personId) {
        const assocUpdates = { ...updates };
        delete assocUpdates.isPrimary; // don't change isPrimary on associations
        if (Object.keys(assocUpdates).length > 0) {
          await this.artifactRepo.update(artifactId, assoc.personId, assocUpdates);
        }
      }
    }

    return this.artifactRepo.findById(artifactId, personId) as Promise<Artifact>;
  }

  async listByPerson(
    personId: string,
    limit?: number,
    cursor?: string,
  ): Promise<PaginatedResponse<Artifact>> {
    const person = await this.personRepo.findById(personId);
    if (!person) throw new NotFoundError('Person', personId);

    const effectiveLimit = Math.min(
      limit || API_CONFIG.PAGINATION_DEFAULT_LIMIT,
      API_CONFIG.PAGINATION_MAX_LIMIT,
    );
    const result = await this.artifactRepo.findByPerson(personId, effectiveLimit, cursor);
    return {
      items: result.items,
      count: result.items.length,
      lastEvaluatedKey: result.lastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
        : undefined,
    };
  }

  async getViewUrl(artifactId: string, personId: string): Promise<string> {
    const artifact = await this.artifactRepo.findById(artifactId, personId);
    if (!artifact) throw new NotFoundError('Artifact', artifactId);

    const command = new GetObjectCommand({
      Bucket: BucketNames.Photos,
      Key: artifact.s3Key,
    });

    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
  }

  async delete(artifactId: string, personId: string, user: AuthenticatedUser): Promise<void> {
    const artifact = await this.artifactRepo.findById(artifactId, personId);
    if (!artifact) return; // Already deleted — nothing to do

    // Uploader or admins can delete
    const canDelete = artifact.uploadedBy === user.userId || user.role === 'admins';
    if (!canDelete) {
      throw new ForbiddenError('You can only delete artifacts you uploaded');
    }

    // Remove all association rows for this artifact
    const associations = await this.artifactRepo.findAllAssociations(artifactId);
    for (const assoc of associations) {
      await this.artifactRepo.delete(assoc.artifactId, assoc.personId);
    }

    // Delete the file from S3
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: artifact.s3Bucket,
          Key: artifact.s3Key,
        }),
      );
    } catch {
      // Log but don't fail — DynamoDB records are already cleaned up
    }
  }

  async associatePeople(
    artifactId: string,
    sourcePersonId: string,
    targetPersonIds: string[],
  ): Promise<void> {
    // Find the source artifact to copy metadata
    const source = await this.artifactRepo.findById(artifactId, sourcePersonId);
    if (!source) throw new NotFoundError('Artifact', artifactId);

    // Verify all target people exist
    for (const targetId of targetPersonIds) {
      const person = await this.personRepo.findById(targetId);
      if (!person) throw new NotFoundError('Person', targetId);
    }

    // Create association rows for each target
    for (const targetId of targetPersonIds) {
      // Skip if already associated
      const existing = await this.artifactRepo.findById(artifactId, targetId);
      if (existing) continue;

      const association: Artifact = {
        ...source,
        personId: targetId,
        isPrimary: false, // only the source person can have this as primary
      };
      await this.artifactRepo.create(association);
    }
  }

  async disassociatePerson(artifactId: string, personId: string): Promise<void> {
    await this.artifactRepo.delete(artifactId, personId);
  }

  async getAssociations(
    artifactId: string,
    knownPersonId: string,
  ): Promise<{ personId: string; name: string }[]> {
    const artifact = await this.artifactRepo.findById(artifactId, knownPersonId);
    if (!artifact) throw new NotFoundError('Artifact', artifactId);

    const associations = await this.artifactRepo.findAllAssociations(artifactId);
    const results: { personId: string; name: string }[] = [];

    for (const assoc of associations) {
      const person = await this.personRepo.findById(assoc.personId);
      if (person) {
        const name = `${person.firstName}${person.middleName ? ` ${person.middleName}` : ''} ${person.lastName}`;
        results.push({ personId: assoc.personId, name });
      }
    }

    return results;
  }
}
