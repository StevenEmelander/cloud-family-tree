import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GedcomImportService } from '../../gedcom/import.service';
import { extractGedzip } from '../../gedcom/gedcom7/gedzip';
import { BucketNames } from '../../lib/s3';
import { authorize } from '../../middleware/auth';
import { ValidationError } from '../../middleware/error-handler';
import { errorResponse, successResponse } from '../../middleware/response';

const service = new GedcomImportService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'admin');

    const body = JSON.parse(event.body || '{}');
    const s3Key = body.s3Key;
    if (!s3Key || typeof s3Key !== 'string') {
      throw new ValidationError(['s3Key is required']);
    }
    if (!s3Key.startsWith('gedzip/') || s3Key.includes('..')) {
      throw new ValidationError(['Invalid s3Key']);
    }

    const { gedcomContent, mediaFiles, metadata } = await extractGedzip(BucketNames.Photos, s3Key);
    const result = await service.import(gedcomContent, mediaFiles, metadata);

    return successResponse(200, result);
  } catch (error) {
    return errorResponse(error);
  }
};
