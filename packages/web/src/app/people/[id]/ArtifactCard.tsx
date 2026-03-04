'use client';

import { api } from '@/lib/api';
import type { ArtifactWithUrl } from './artifacts-tab';
import { TYPE_BADGE_CLASS, TYPE_LABELS, formatSource } from './artifacts-tab';
import styles from './artifacts-tab.module.css';

interface ArtifactCardProps {
  artifact: ArtifactWithUrl;
  personId: string;
  canDelete: boolean;
  onEdit: (artifact: ArtifactWithUrl) => void;
  onDelete: (artifact: ArtifactWithUrl) => void;
  onOpenLightbox: (artifact: ArtifactWithUrl) => void;
  onDownload: (artifact: ArtifactWithUrl) => void;
}

export function ArtifactCard({
  artifact,
  personId,
  canDelete,
  onEdit,
  onDelete,
  onOpenLightbox,
  onDownload,
}: ArtifactCardProps) {
  return (
    <div className={styles.card}>
      {artifact.contentType === 'application/pdf' ? (
        <button
          type="button"
          className={styles.pdfPlaceholder}
          onClick={async () => {
            try {
              const { url } = await api.getArtifactUrl(artifact.artifactId, personId);
              window.open(url, '_blank');
            } catch {
              // ignore
            }
          }}
        >
          <span className={styles.pdfIcon}>PDF</span>
          <span className={styles.pdfLabel}>
            {TYPE_LABELS[artifact.artifactType] || 'Document'}
          </span>
        </button>
      ) : artifact.viewUrl ? (
        <button
          type="button"
          className={styles.imageButton}
          onClick={() => onOpenLightbox(artifact)}
        >
          {/* biome-ignore lint/performance/noImgElement: S3 presigned URL not compatible with next/image */}
          <img
            src={artifact.viewUrl}
            alt={artifact.caption || artifact.fileName}
            className={styles.image}
            loading="lazy"
          />
        </button>
      ) : (
        <div className={styles.imagePlaceholder}>Unable to load</div>
      )}
      <div className={styles.cardInfo}>
        <span
          className={`${styles.typeBadge} ${styles[TYPE_BADGE_CLASS[artifact.artifactType] || 'badgeOther']}`}
        >
          {TYPE_LABELS[artifact.artifactType] || artifact.artifactType}
        </span>
        {artifact.caption && <p className={styles.caption}>{artifact.caption}</p>}
        {artifact.metadata?.censusLocation && (
          <p className={styles.date}>Location: {artifact.metadata.censusLocation}</p>
        )}
        {artifact.metadata?.shipName && (
          <p className={styles.date}>Ship: {artifact.metadata.shipName}</p>
        )}
        {artifact.metadata?.portOfArrival && (
          <p className={styles.date}>Port: {artifact.metadata.portOfArrival}</p>
        )}
        {artifact.source &&
          (() => {
            const { text, href } = formatSource(artifact.source ?? '');
            return (
              <p className={styles.source}>
                Source:{' '}
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {text}
                  </a>
                ) : (
                  text
                )}
              </p>
            );
          })()}
        {artifact.date && <p className={styles.date}>Date: {artifact.date}</p>}
        {artifact.isPrimary && <span className={styles.primaryBadge}>Profile Photo</span>}
        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.btnDownload}
            onClick={() => onDownload(artifact)}
          >
            Download
          </button>
          {canDelete && (
            <>
              <button
                type="button"
                className={styles.btnEdit}
                onClick={() => onEdit(artifact)}
              >
                Edit
              </button>
              <button
                type="button"
                className={styles.btnDelete}
                onClick={() => onDelete(artifact)}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
