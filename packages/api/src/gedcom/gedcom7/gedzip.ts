import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Artifact, Entry } from '@cloud-family-tree/shared';
import { API_CONFIG } from '@cloud-family-tree/shared';
import JSZip from 'jszip';
import { s3Client } from '../../lib/s3';

const GEDCOM_FILENAME = 'gedcom.ged';
const METADATA_FILENAME = 'metadata.json';

/** Extra data stored in metadata.json that has no GEDCOM equivalent */
export interface GedzipMetadata {
  version: 1;
  entries?: Entry[];
  /** Map of artifactId → custom metadata key-value pairs */
  artifactMetadata?: Record<string, Record<string, string>>;
}

/**
 * Create a GEDZIP archive (.gdz) containing GEDCOM data and artifact media files.
 * Returns the S3 key where the archive was uploaded.
 */
export async function createGedzip(
  gedcomContent: string,
  artifacts: Artifact[],
  bucketName: string,
  metadata?: GedzipMetadata,
): Promise<string> {
  const zip = new JSZip();

  // Add GEDCOM file
  zip.file(GEDCOM_FILENAME, gedcomContent);

  // Add metadata.json if present
  if (metadata) {
    zip.file(METADATA_FILENAME, JSON.stringify(metadata, null, 2));
  }

  // Add artifact media files from S3
  for (const artifact of artifacts) {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: artifact.s3Bucket,
          Key: artifact.s3Key,
        }),
      );
      if (response.Body) {
        const bytes = await response.Body.transformToByteArray();
        zip.file(`media/${artifact.fileName}`, bytes);
      }
    } catch (err) {
      console.warn(`Failed to fetch artifact ${artifact.artifactId} from S3:`, err);
    }
  }

  // Generate ZIP buffer
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  // Upload to S3
  const s3Key = `gedzip/export-${Date.now()}.gdz`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: zipBuffer,
      ContentType: 'application/zip',
    }),
  );

  return s3Key;
}

/**
 * Get a presigned download URL for a GEDZIP file in S3.
 */
export async function getGedzipDownloadUrl(bucketName: string, s3Key: string): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: bucketName, Key: s3Key }),
    { expiresIn: API_CONFIG.PRESIGNED_URL_EXPIRY_SECONDS },
  );
}

/**
 * Get a presigned upload URL for GEDZIP import.
 */
export async function getGedzipUploadUrl(bucketName: string): Promise<{ s3Key: string; uploadUrl: string }> {
  const s3Key = `gedzip/import-${Date.now()}.gdz`;
  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      ContentType: 'application/zip',
    }),
    { expiresIn: API_CONFIG.PRESIGNED_URL_EXPIRY_SECONDS },
  );
  return { s3Key, uploadUrl };
}

export interface ExtractedGedzip {
  gedcomContent: string;
  mediaFiles: Map<string, Buffer>; // filename → file content
  metadata?: GedzipMetadata;
}

/**
 * Extract a GEDZIP archive from S3.
 * Returns the GEDCOM text content and a map of media files.
 */
export async function extractGedzip(bucketName: string, s3Key: string): Promise<ExtractedGedzip> {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: bucketName, Key: s3Key }),
  );

  if (!response.Body) {
    throw new Error('Empty GEDZIP file');
  }

  const bytes = await response.Body.transformToByteArray();
  const zip = await JSZip.loadAsync(bytes);

  // Find the GEDCOM file
  const gedcomFile = zip.file(GEDCOM_FILENAME) ?? zip.file(/\.ged$/i)[0];
  if (!gedcomFile) {
    throw new Error('No GEDCOM file found in GEDZIP archive');
  }
  const gedcomContent = await gedcomFile.async('string');

  // Extract media files
  const mediaFiles = new Map<string, Buffer>();
  const mediaFolder = zip.folder('media');
  if (mediaFolder) {
    const mediaEntries = mediaFolder.filter((_, file) => !file.dir);
    for (const entry of mediaEntries) {
      const content = await entry.async('nodebuffer');
      // Strip "media/" prefix from the name
      const filename = entry.name.replace(/^media\//, '');
      mediaFiles.set(filename, content);
    }
  }

  // Extract metadata.json if present
  let metadata: GedzipMetadata | undefined;
  const metadataFile = zip.file(METADATA_FILENAME);
  if (metadataFile) {
    try {
      const metadataStr = await metadataFile.async('string');
      metadata = JSON.parse(metadataStr) as GedzipMetadata;
    } catch (err) {
      console.warn('Failed to parse metadata.json in GEDZIP:', err);
    }
  }

  return { gedcomContent, mediaFiles, metadata };
}
