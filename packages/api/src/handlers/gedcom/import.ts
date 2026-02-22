import { API_CONFIG } from '@cloud-family-tree/shared';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GedcomImportService } from '../../gedcom/import.service';
import { authorize } from '../../middleware/auth';
import { ValidationError } from '../../middleware/error-handler';
import { errorResponse, successResponse } from '../../middleware/response';

const service = new GedcomImportService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'admin');

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : event.body || '';

    if (!rawBody.trim()) {
      throw new ValidationError(['GEDCOM file content is empty']);
    }

    // Client sends JSON: { gedcom: "..." }
    let gedcomContent: string;
    try {
      const parsed = JSON.parse(rawBody);
      gedcomContent = parsed.gedcom || '';
    } catch {
      // Fallback: treat entire body as raw GEDCOM text
      gedcomContent = rawBody;
    }

    if (!gedcomContent.trim()) {
      throw new ValidationError(['GEDCOM file content is empty']);
    }

    const maxSize = API_CONFIG.MAX_GEDCOM_FILE_SIZE_MB * 1024 * 1024;
    if (Buffer.byteLength(gedcomContent) > maxSize) {
      throw new ValidationError([`File exceeds ${API_CONFIG.MAX_GEDCOM_FILE_SIZE_MB}MB limit`]);
    }

    const result = await service.import(gedcomContent);
    return successResponse(200, result);
  } catch (error) {
    return errorResponse(error);
  }
};
