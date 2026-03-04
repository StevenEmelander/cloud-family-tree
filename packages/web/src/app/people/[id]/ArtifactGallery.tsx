'use client';

import type { ArtifactWithUrl, FilterType } from './artifacts-tab';
import { ArtifactCard } from './ArtifactCard';
import styles from './artifacts-tab.module.css';

interface ArtifactGalleryProps {
  artifacts: ArtifactWithUrl[];
  loading: boolean;
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  onArtifactEdit: (artifact: ArtifactWithUrl) => void;
  onArtifactDelete: (artifact: ArtifactWithUrl) => void;
  onArtifactOpenLightbox: (artifact: ArtifactWithUrl) => void;
  onArtifactDownload: (artifact: ArtifactWithUrl) => void;
  canDelete: (artifact: ArtifactWithUrl) => boolean;
  personId: string;
  filteredArtifacts: ArtifactWithUrl[];
}

export function ArtifactGallery({
  artifacts,
  loading,
  filter,
  onFilterChange,
  onArtifactEdit,
  onArtifactDelete,
  onArtifactOpenLightbox,
  onArtifactDownload,
  canDelete,
  personId,
  filteredArtifacts,
}: ArtifactGalleryProps) {
  if (loading) {
    return <p className={styles.status}>Loading artifacts...</p>;
  }

  return (
    <>
      {/* Filter tabs */}
      {artifacts.length > 0 && (
        <div className={styles.filterTabs}>
          {(
            [
              ['all', 'All'],
              ['graves', 'Grave'],
              ['records', 'Records'],
              ['photos', 'Photos'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`${styles.filterTab} ${filter === key ? styles.filterTabActive : ''}`}
              onClick={() => onFilterChange(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Gallery grid */}
      {filteredArtifacts.length === 0 ? (
        <p className={styles.empty}>
          {artifacts.length === 0 ? 'No artifacts yet.' : 'No artifacts match this filter.'}
        </p>
      ) : (
        <div className={styles.grid}>
          {filteredArtifacts.map((artifact) => (
            <ArtifactCard
              key={`${artifact.artifactId}-${artifact.personId}`}
              artifact={artifact}
              personId={personId}
              canDelete={canDelete(artifact)}
              onEdit={onArtifactEdit}
              onDelete={onArtifactDelete}
              onOpenLightbox={onArtifactOpenLightbox}
              onDownload={onArtifactDownload}
            />
          ))}
        </div>
      )}
    </>
  );
}
