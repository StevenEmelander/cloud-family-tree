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
    // Collect all people
    const allPeople: Person[] = [];
    for await (const batch of this.personRepo.iterateAll()) {
      allPeople.push(...batch);
    }

    // Collect all relationships (deduplicated)
    const allRelationships: Relationship[] = [];
    const seenRelIds = new Set<string>();
    for (const person of allPeople) {
      const rels = await this.relationshipRepo.findByPerson(person.personId);
      for (const rel of rels) {
        if (!seenRelIds.has(rel.relationshipId)) {
          seenRelIds.add(rel.relationshipId);
          allRelationships.push(rel);
        }
      }
    }

    // Collect all sources
    const allSources: Source[] = await this.sourceRepo.findAll();

    // Collect all artifacts (per-person)
    const allArtifacts: Artifact[] = [];
    for (const person of allPeople) {
      const result = await this.artifactRepo.findByPerson(person.personId);
      allArtifacts.push(...result.items);
    }

    // Generate GEDCOM 7 content
    const gedcomContent = generateGedcom7({
      people: allPeople,
      relationships: allRelationships,
      sources: allSources,
      artifacts: allArtifacts,
    });

    return {
      gedcomContent,
      peopleExported: allPeople.length,
      relationshipsExported: allRelationships.length,
      sourcesExported: allSources.length,
      artifactsExported: allArtifacts.length,
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

    const allRelationships: Relationship[] = [];
    const seenRelIds = new Set<string>();
    for (const person of allPeople) {
      const rels = await this.relationshipRepo.findByPerson(person.personId);
      for (const rel of rels) {
        if (!seenRelIds.has(rel.relationshipId)) {
          seenRelIds.add(rel.relationshipId);
          allRelationships.push(rel);
        }
      }
    }

    const allSources: Source[] = await this.sourceRepo.findAll();

    const allArtifacts: Artifact[] = [];
    for (const person of allPeople) {
      const result = await this.artifactRepo.findByPerson(person.personId);
      allArtifacts.push(...result.items);
    }

    return {
      people: allPeople,
      relationships: allRelationships,
      sources: allSources,
      artifacts: allArtifacts,
    };
  }
}
