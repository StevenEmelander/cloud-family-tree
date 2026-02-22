import { S3Client } from '@aws-sdk/client-s3';

export const s3Client = new S3Client({});

export const BucketNames = {
  Photos: process.env.PHOTOS_BUCKET_NAME!,
};
