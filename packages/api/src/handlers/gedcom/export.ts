import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GedcomExportService } from '../../gedcom/export.service';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';

const service = new GedcomExportService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'admin');
    const result = await service.export();
    return successResponse(200, {
      gedcom: result.gedcomContent,
      peopleExported: result.peopleExported,
      relationshipsExported: result.relationshipsExported,
      sourcesExported: result.sourcesExported,
      artifactsExported: result.artifactsExported,
      exportedAt: result.exportedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
