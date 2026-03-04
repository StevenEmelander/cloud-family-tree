'use client';

import type { Person } from '@cloud-family-tree/shared';
import styles from './page.module.css';
import type { Tab } from './person-detail';

interface PersonHeaderProps {
  person: Person;
  canEdit: boolean;
  editing: boolean;
  saving: boolean;
  tab: Tab;
  onEditToggle: () => void;
  onTabChange: (tab: Tab) => void;
  personId: string;
}

export function PersonHeader({
  person,
  canEdit,
  editing,
  saving,
  tab,
  onEditToggle,
  onTabChange,
}: PersonHeaderProps) {
  return (
    <>
      <div className={styles.profileHeader}>
        <h1>
          {person.firstName} {person.middleName ? `${person.middleName} ` : ''}
          {person.lastName}
        </h1>
        {canEdit && tab === 'details' && (
          <button
            type="button"
            className={editing ? styles.btnDoneEditing : styles.btnEdit}
            onClick={onEditToggle}
            disabled={saving}
          >
            {editing ? 'Done Editing' : 'Edit'}
          </button>
        )}
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'details' ? styles.tabActive : ''}`}
          onClick={() => onTabChange('details')}
        >
          Details
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'tree' ? styles.tabActive : ''}`}
          onClick={() => onTabChange('tree')}
        >
          <span className={styles.tabFull}>Family Tree</span>
          <span className={styles.tabShort}>Tree</span>
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'artifacts' ? styles.tabActive : ''}`}
          onClick={() => onTabChange('artifacts')}
        >
          Artifacts
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'wall' ? styles.tabActive : ''}`}
          onClick={() => onTabChange('wall')}
        >
          <span className={styles.tabFull}>Memorial Wall</span>
          <span className={styles.tabShort}>Wall</span>
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'issues' ? styles.tabActive : ''}`}
          onClick={() => onTabChange('issues')}
        >
          Issues
        </button>
      </div>
    </>
  );
}
