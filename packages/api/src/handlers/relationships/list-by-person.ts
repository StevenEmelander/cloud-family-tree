import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { RelationshipService } from '../../services/relationship.service';

const relationshipService = new RelationshipService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'read');
    const personId = event.pathParameters?.id;
    if (!personId) return errorResponse(new Error('Missing id parameter'));

    const view = event.queryStringParameters?.view; // 'ancestors' | 'descendants' | undefined

    if (view === 'ancestors') {
      const ancestors = await relationshipService.getAncestors(personId);
      return successResponse(200, { items: ancestors, count: ancestors.length });
    }

    if (view === 'descendants') {
      const descendants = await relationshipService.getDescendants(personId);
      return successResponse(200, { items: descendants, count: descendants.length });
    }

    if (view === 'family-tree') {
      const data = await relationshipService.getPersonDetail(personId);
      return successResponse(200, {
        person: data.person,
        items: data.relationships,
        count: data.relationships.length,
        otherParent: data.otherParent,
        spouseParents: data.spouseParents,
        parentMarriages: data.parentMarriages,
        relatedPeople: data.relatedPeople,
      });
    }

    // Default: all relationships for this person
    const relationships = await relationshipService.listByPerson(personId);
    return successResponse(200, { items: relationships, count: relationships.length });
  } catch (error) {
    return errorResponse(error);
  }
};
