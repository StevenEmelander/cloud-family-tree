import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { Entry } from '@cloud-family-tree/shared';
import { GedcomExportService } from '../../gedcom/export.service';
import { generateGedcom7 } from '../../gedcom/gedcom7/generator';
import { type GedzipMetadata, createGedzip, getGedzipDownloadUrl } from '../../gedcom/gedcom7/gedzip';
import { BucketNames } from '../../lib/s3';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { EntryRepository } from '../../repositories/entry.repository';

const exportService = new GedcomExportService();
const entryRepo = new EntryRepository();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'admin');

    const { people, relationships, sources, artifacts } = await exportService.fetchAllData();

    const gedcomContent = generateGedcom7({
      people,
      relationships,
      sources,
      artifacts,
      artifactFilePaths: new Map(artifacts.map((a) => [a.artifactId, `media/${a.fileName}`])),
    });

    // Collect entries for metadata.json
    const allEntries: Entry[] = [];
    let entryCursor: string | undefined;
    do {
      const result = await entryRepo.findAll(100, entryCursor);
      allEntries.push(...result.items);
      entryCursor = result.lastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
        : undefined;
    } while (entryCursor);

    // Build artifact metadata map
    const artifactMetadata: Record<string, Record<string, string>> = {};
    for (const a of artifacts) {
      if (a.metadata && Object.keys(a.metadata).length > 0) {
        artifactMetadata[a.artifactId] = a.metadata;
      }
    }

    const metadata: GedzipMetadata = {
      version: 1,
      ...(allEntries.length > 0 && { entries: allEntries }),
      ...(Object.keys(artifactMetadata).length > 0 && { artifactMetadata }),
    };

    const s3Key = await createGedzip(gedcomContent, artifacts, BucketNames.Photos, metadata);
    const downloadUrl = await getGedzipDownloadUrl(BucketNames.Photos, s3Key);

    return successResponse(200, {
      downloadUrl,
      peopleExported: people.length,
      relationshipsExported: relationships.length,
      sourcesExported: sources.length,
      artifactsExported: artifacts.length,
      entriesExported: allEntries.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
