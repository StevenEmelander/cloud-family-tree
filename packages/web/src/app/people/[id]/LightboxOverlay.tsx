'use client';

import type {
  Person,
  Relationship,
  RelationshipMetadata,
} from '@cloud-family-tree/shared';
import { ArtifactType } from '@cloud-family-tree/shared';
import Link from 'next/link';
import { formatLifespan } from '@/lib/date-utils';
import type { ArtifactWithUrl, RelatedPerson } from './artifacts-tab';
import { TYPE_BADGE_CLASS, TYPE_LABELS, formatSource } from './artifacts-tab';
import styles from './artifacts-tab.module.css';

interface LightboxOverlayProps {
  artifact: ArtifactWithUrl;
  personId: string;
  person: Person;
  relatedPeople: Record<string, RelatedPerson>;
  relationships: Relationship[];
  associations: { personId: string; name: string }[];
  associationsLoading: boolean;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (artifact: ArtifactWithUrl) => void;
  onDownload: (artifact: ArtifactWithUrl) => void;
}

export function LightboxOverlay({
  artifact,
  personId,
  person,
  relatedPeople,
  relationships,
  associations,
  associationsLoading,
  canEdit,
  onClose,
  onEdit,
  onDownload,
}: LightboxOverlayProps) {
  if (!artifact.viewUrl) return null;

  const lbType = artifact.artifactType as ArtifactType;
  const lbSource = artifact.source ? formatSource(artifact.source) : null;

  // Find marriage/divorce metadata from relationships
  let spouseRelMeta: RelationshipMetadata | undefined;
  if (lbType === ArtifactType.MARRIAGE_RECORD || lbType === ArtifactType.DIVORCE_RECORD) {
    const spouseAssoc = associations.find((a) => a.personId !== personId);
    if (spouseAssoc) {
      const rel = relationships.find(
        (r) =>
          r.relationshipType === 'SPOUSE' &&
          (r.person1Id === spouseAssoc.personId || r.person2Id === spouseAssoc.personId),
      );
      spouseRelMeta = rel?.metadata;
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: lightbox backdrop click-to-dismiss pattern
    <div
      className={styles.lightboxOverlay}
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className={styles.lightboxContent}
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.lightboxClose} onClick={onClose}>
          &times;
        </button>

        <div className={styles.lightboxImageContainer}>
          {/* biome-ignore lint/performance/noImgElement: S3 presigned URL not compatible with next/image */}
          <img
            src={artifact.viewUrl}
            alt={artifact.caption || artifact.fileName}
            className={styles.lightboxImage}
          />
        </div>

        <div className={styles.lightboxDetails}>
          {/* Type badge */}
          <span
            className={`${styles.typeBadge} ${styles[TYPE_BADGE_CLASS[artifact.artifactType] || 'badgeOther']}`}
          >
            {TYPE_LABELS[artifact.artifactType] || artifact.artifactType}
          </span>

          {/* Caption / Inscription */}
          {artifact.caption && (
            <div className={styles.lightboxDetailRow}>
              <span className={styles.lightboxDetailLabel}>
                {lbType === ArtifactType.GRAVE ? 'Inscription' : 'Caption'}
              </span>
              <p className={styles.lightboxDetailValue}>{artifact.caption}</p>
            </div>
          )}

          {/* Source */}
          {lbSource && (
            <div className={styles.lightboxDetailRow}>
              <span className={styles.lightboxDetailLabel}>Source</span>
              <p className={styles.lightboxDetailValue}>
                {lbSource.href ? (
                  <a href={lbSource.href} target="_blank" rel="noopener noreferrer">
                    {lbSource.text}
                  </a>
                ) : (
                  lbSource.text
                )}
              </p>
            </div>
          )}

          {/* Date */}
          {artifact.date && (
            <div className={styles.lightboxDetailRow}>
              <span className={styles.lightboxDetailLabel}>Date</span>
              <p className={styles.lightboxDetailValue}>{artifact.date}</p>
            </div>
          )}

          {/* Type-specific metadata */}
          {lbType === ArtifactType.GRAVE && person.burialPlace && (
            <div className={styles.lightboxDetailRow}>
              <span className={styles.lightboxDetailLabel}>Cemetery / Location</span>
              <p className={styles.lightboxDetailValue}>{person.burialPlace}</p>
            </div>
          )}
          {lbType === ArtifactType.BIRTH_RECORD && person.birthPlace && (
            <div className={styles.lightboxDetailRow}>
              <span className={styles.lightboxDetailLabel}>Birth Place</span>
              <p className={styles.lightboxDetailValue}>{person.birthPlace}</p>
            </div>
          )}
          {lbType === ArtifactType.DEATH_RECORD && person.deathPlace && (
            <div className={styles.lightboxDetailRow}>
              <span className={styles.lightboxDetailLabel}>Death Place</span>
              <p className={styles.lightboxDetailValue}>{person.deathPlace}</p>
            </div>
          )}
          {lbType === ArtifactType.CENSUS_RECORD &&
            artifact.metadata?.censusLocation && (
              <div className={styles.lightboxDetailRow}>
                <span className={styles.lightboxDetailLabel}>Location</span>
                <p className={styles.lightboxDetailValue}>
                  {artifact.metadata.censusLocation}
                </p>
              </div>
            )}
          {lbType === ArtifactType.IMMIGRATION_RECORD &&
            artifact.metadata?.shipName && (
              <div className={styles.lightboxDetailRow}>
                <span className={styles.lightboxDetailLabel}>Ship</span>
                <p className={styles.lightboxDetailValue}>
                  {artifact.metadata.shipName}
                </p>
              </div>
            )}
          {lbType === ArtifactType.IMMIGRATION_RECORD &&
            artifact.metadata?.portOfArrival && (
              <div className={styles.lightboxDetailRow}>
                <span className={styles.lightboxDetailLabel}>Port of Arrival</span>
                <p className={styles.lightboxDetailValue}>
                  {artifact.metadata.portOfArrival}
                </p>
              </div>
            )}
          {lbType === ArtifactType.MARRIAGE_RECORD && spouseRelMeta && (
            <>
              {spouseRelMeta.marriageDate && (
                <div className={styles.lightboxDetailRow}>
                  <span className={styles.lightboxDetailLabel}>Marriage Date</span>
                  <p className={styles.lightboxDetailValue}>{spouseRelMeta.marriageDate}</p>
                </div>
              )}
              {spouseRelMeta.marriagePlace && (
                <div className={styles.lightboxDetailRow}>
                  <span className={styles.lightboxDetailLabel}>Marriage Place</span>
                  <p className={styles.lightboxDetailValue}>
                    {spouseRelMeta.marriagePlace}
                  </p>
                </div>
              )}
            </>
          )}
          {lbType === ArtifactType.DIVORCE_RECORD && spouseRelMeta && (
            <>
              {spouseRelMeta.divorceDate && (
                <div className={styles.lightboxDetailRow}>
                  <span className={styles.lightboxDetailLabel}>Divorce Date</span>
                  <p className={styles.lightboxDetailValue}>{spouseRelMeta.divorceDate}</p>
                </div>
              )}
              {spouseRelMeta.divorcePlace && (
                <div className={styles.lightboxDetailRow}>
                  <span className={styles.lightboxDetailLabel}>Divorce Place</span>
                  <p className={styles.lightboxDetailValue}>{spouseRelMeta.divorcePlace}</p>
                </div>
              )}
            </>
          )}

          {/* Profile photo badge */}
          {artifact.isPrimary && (
            <span className={styles.lightboxPrimaryBadge}>Profile Photo</span>
          )}

          {/* Associated people */}
          {(associationsLoading || associations.length > 0) && (
            <div className={styles.lightboxPeopleSection}>
              <span className={styles.lightboxDetailLabel}>People</span>
              {associationsLoading ? (
                <span className={styles.lightboxLoading}>Loading...</span>
              ) : (
                associations.map((assoc) => {
                  const isGrave = lbType === ArtifactType.GRAVE;
                  const pInfo =
                    assoc.personId === personId
                      ? { birthDate: person.birthDate, deathDate: person.deathDate }
                      : relatedPeople[assoc.personId];
                  const lifespan = pInfo
                    ? formatLifespan(pInfo.birthDate, pInfo.deathDate)
                    : '';
                  return (
                    <Link
                      key={assoc.personId}
                      href={`/people/${assoc.personId}`}
                      className={styles.lightboxPersonLink}
                      onClick={onClose}
                    >
                      <span>{assoc.name}</span>
                      {(isGrave || lifespan) && (
                        <span className={styles.lightboxPersonLifespan}>{lifespan}</span>
                      )}
                    </Link>
                  );
                })
              )}
            </div>
          )}

          {/* Actions */}
          <div className={styles.lightboxActions}>
            <button
              type="button"
              className={styles.btnDownload}
              onClick={() => onDownload(artifact)}
            >
              Download
            </button>
            {canEdit && (
              <button
                type="button"
                className={styles.btnEdit}
                onClick={() => {
                  onEdit(artifact);
                  onClose();
                }}
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
