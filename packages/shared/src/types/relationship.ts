export enum RelationshipType {
  PARENT_CHILD = 'PARENT_CHILD',
  SPOUSE = 'SPOUSE',
}

export interface Relationship {
  relationshipId: string;
  relationshipType: RelationshipType;
  person1Id: string; // PARENT_CHILD: parent, SPOUSE: either
  person2Id: string; // PARENT_CHILD: child, SPOUSE: either
  metadata?: RelationshipMetadata;
  createdAt: string; // ISO timestamp
}

export interface RelationshipMetadata {
  marriageDate?: string; // ISO date YYYY-MM-DD (SPOUSE only)
  marriagePlace?: string;
  divorceDate?: string; // ISO date YYYY-MM-DD (SPOUSE only)
  divorcePlace?: string;
}

export interface CreateRelationshipInput {
  relationshipType: RelationshipType;
  person1Id: string;
  person2Id: string;
  metadata?: RelationshipMetadata;
}
