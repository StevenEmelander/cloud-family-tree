import type { Artifact, GedcomExportResult, Person, Relationship, Source } from '@cloud-family-tree/shared';
import { isoNow } from '@cloud-family-tree/shared';
import { ArtifactRepository } from '../repositories/artifact.repository';
import { PersonRepository } from '../repositories/person.repository';
import { RelationshipRepository } from '../repositories/relationship.repository';
import { SourceRepository } from '../repositories/source.repository';
import { generateGedcom7 } from './gedcom7/generator';

export class GedcomExportService {
  private readonly personRepo = new PersonRepository();
  private readonly relationshipRepo = new RelationshipRepository();
  private readonly sourceRepo = new SourceRepository();
  private readonly artifactRepo = new ArtifactRepository();

  async export(): Promise<GedcomExportResult> {
    const data = await this.fetchAllData();

    const gedcomContent = generateGedcom7(data);

    return {
      gedcomContent,
      peopleExported: data.people.length,
      relationshipsExported: data.relationships.length,
      sourcesExported: data.sources.length,
      artifactsExported: data.artifacts.length,
      exportedAt: isoNow(),
    };
  }

  /** Fetch all data needed for export (shared by GEDCOM and GEDZIP export) */
  async fetchAllData(): Promise<{
    people: Person[];
    relationships: Relationship[];
    sources: Source[];
    artifacts: Artifact[];
  }> {
    const allPeople: Person[] = [];
    for await (const batch of this.personRepo.iterateAll()) {
      allPeople.push(...batch);
    }

    // Iterate all relationships via GSI (avoids N+1 per-person queries)
    const allRelationships: Relationship[] = [];
    const seenRelIds = new Set<string>();
    for await (const batch of this.relationshipRepo.iterateAll()) {
      for (const rel of batch) {
        if (!seenRelIds.has(rel.relationshipId)) {
          seenRelIds.add(rel.relationshipId);
          allRelationships.push(rel);
        }
      }
    }

    const allSources: Source[] = await this.sourceRepo.findAll();

    // Iterate all artifacts via GSI (avoids N+1 per-person queries)
    const allArtifacts: Artifact[] = [];
    const seenArtifactKeys = new Set<string>();
    for await (const batch of this.artifactRepo.iterateAll()) {
      for (const artifact of batch) {
        const key = `${artifact.artifactId}#${artifact.personId}`;
        if (!seenArtifactKeys.has(key)) {
          seenArtifactKeys.add(key);
          allArtifacts.push(artifact);
        }
      }
    }

    return {
      people: allPeople,
      relationships: allRelationships,
      sources: allSources,
      artifacts: allArtifacts,
    };
  }
}
