'use client';

import type { Source } from '@cloud-family-tree/shared';
import { AlternateNameType } from '@cloud-family-tree/shared';
import { QualifiedDateInput } from '@/components/QualifiedDateInput';
import { SourceSelector } from '@/components/SourceSelector';
import styles from './page.module.css';
import type { EditForm } from './person-detail';
import {
  DEFAULT_EVENT_FIELDS,
  EVENT_FIELDS,
  EVENT_TYPE_LABELS,
  NAME_TYPE_LABELS,
} from './person-detail';

interface PersonEditFormProps {
  editForm: EditForm;
  editError: string | null;
  fieldErrors: Record<string, string>;
  allSources: Source[];
  saving: boolean;
  onFormChange: (form: EditForm) => void;
  onSave: () => void;
  onCancel: () => void;
  onSourceCreated: (source: Source) => void;
}

export function PersonEditForm({
  editForm,
  editError,
  fieldErrors,
  allSources,
  saving,
  onFormChange,
  onSave,
  onCancel,
  onSourceCreated,
}: PersonEditFormProps) {
  function inputClass(field: string) {
    return `${styles.formInput}${fieldErrors[field] ? ` ${styles.formInputError}` : ''}`;
  }

  const textField = (
    label: string,
    field: Exclude<keyof EditForm, 'events' | 'citations' | 'alternateNames'>,
    required?: boolean,
  ) => (
    <label key={field} className={styles.formField}>
      <span className={styles.formLabel}>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type="text"
        className={inputClass(field)}
        value={editForm[field]}
        onChange={(e) => onFormChange({ ...editForm, [field]: e.target.value })}
      />
      {fieldErrors[field] && <span className={styles.fieldError}>{fieldErrors[field]}</span>}
    </label>
  );

  return (
    <div className={styles.detailsCard}>
      {editError && <p className={styles.editError}>{editError}</p>}
      <div className={styles.editForm}>
        {textField('First Name', 'firstName', true)}
        {textField('Middle Name', 'middleName')}
        {textField('Last Name', 'lastName', true)}
        <label className={styles.formField}>
          <span className={styles.formLabel}>Gender</span>
          <select
            className={styles.formSelect}
            value={editForm.gender}
            onChange={(e) => onFormChange({ ...editForm, gender: e.target.value })}
          >
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </label>
        <label className={styles.formField}>
          <span className={styles.formLabel}>Biography</span>
          <textarea
            className={`${styles.formTextarea}${fieldErrors.biography ? ` ${styles.formInputError}` : ''}`}
            rows={4}
            maxLength={5000}
            value={editForm.biography}
            onChange={(e) => onFormChange({ ...editForm, biography: e.target.value })}
          />
          {fieldErrors.biography && (
            <span className={styles.fieldError}>{fieldErrors.biography}</span>
          )}
        </label>

        {/* Events editor */}
        <div className={styles.eventsEditor}>
          <div className={styles.eventsEditorHeader}>
            <span className={styles.formLabel}>Events &amp; Attributes</span>
            <button
              type="button"
              className={styles.btnAddEvent}
              onClick={() =>
                onFormChange({
                  ...editForm,
                  events: [
                    ...editForm.events,
                    { type: '', detail: '', date: '', dateQualifier: '', place: '' },
                  ],
                })
              }
            >
              + Add
            </button>
          </div>
          {editForm.events.map((evt, i) => (
            <div key={i} className={styles.eventBlock}>
              <div className={styles.eventBlockHeader}>
                {evt.artifactId ? (
                  <span className={styles.artifactLinkedType}>
                    {EVENT_TYPE_LABELS[evt.type] || evt.type}
                  </span>
                ) : (
                  <select
                    className={styles.formSelect}
                    value={evt.type}
                    onChange={(e) => {
                      const updated = [...editForm.events];
                      updated[i] = { ...evt, type: e.target.value };
                      onFormChange({ ...editForm, events: updated });
                    }}
                  >
                    <option value="">Select type...</option>
                    {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
                {!evt.artifactId && (
                  <button
                    type="button"
                    className={styles.btnRemoveEvent}
                    onClick={() => {
                      const updated = editForm.events.filter((_, j) => j !== i);
                      onFormChange({ ...editForm, events: updated });
                    }}
                    title="Remove"
                  >
                    &times;
                  </button>
                )}
              </div>
              {(EVENT_FIELDS[evt.type] ?? DEFAULT_EVENT_FIELDS).date && (
                /* biome-ignore lint/a11y/noLabelWithoutControl: QualifiedDateInput renders its own input elements */
                <label className={styles.eventBlockField}>
                  <span className={styles.eventFieldLabel}>Date</span>
                  <QualifiedDateInput
                    qualifier={evt.dateQualifier}
                    onQualifierChange={(v) => {
                      const updated = [...editForm.events];
                      updated[i] = { ...evt, dateQualifier: v };
                      onFormChange({ ...editForm, events: updated });
                    }}
                    date={evt.date}
                    onDateChange={(v) => {
                      const updated = [...editForm.events];
                      updated[i] = { ...evt, date: v };
                      onFormChange({ ...editForm, events: updated });
                    }}
                  />
                </label>
              )}
              {(EVENT_FIELDS[evt.type] ?? DEFAULT_EVENT_FIELDS).place && (
                <label className={styles.eventBlockField}>
                  <span className={styles.eventFieldLabel}>Place</span>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder={(EVENT_FIELDS[evt.type] ?? DEFAULT_EVENT_FIELDS).place as string}
                    value={evt.place}
                    onChange={(e) => {
                      const updated = [...editForm.events];
                      updated[i] = { ...evt, place: e.target.value };
                      onFormChange({ ...editForm, events: updated });
                    }}
                  />
                </label>
              )}
              {(EVENT_FIELDS[evt.type] ?? DEFAULT_EVENT_FIELDS).detail && (
                <label className={styles.eventBlockField}>
                  <span className={styles.eventFieldLabel}>Detail</span>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder={(EVENT_FIELDS[evt.type] ?? DEFAULT_EVENT_FIELDS).detail as string}
                    value={evt.detail}
                    onChange={(e) => {
                      const updated = [...editForm.events];
                      updated[i] = { ...evt, detail: e.target.value };
                      onFormChange({ ...editForm, events: updated });
                    }}
                  />
                </label>
              )}
              <div className={styles.eventBlockField}>
                <span className={styles.eventFieldLabel}>Source</span>
                <SourceSelector
                  sources={allSources}
                  selectedSourceId={evt.sourceId || null}
                  onSelect={(sid) => {
                    const updated = [...editForm.events];
                    updated[i] = { ...evt, sourceId: sid || undefined };
                    onFormChange({ ...editForm, events: updated });
                  }}
                  onSourceCreated={onSourceCreated}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Alternate Names editor */}
        <div className={styles.eventsEditor}>
          <div className={styles.eventsEditorHeader}>
            <span className={styles.formLabel}>Alternate Names</span>
            <button
              type="button"
              className={styles.btnAddEvent}
              onClick={() =>
                onFormChange({
                  ...editForm,
                  alternateNames: [
                    ...editForm.alternateNames,
                    { type: '', firstName: '', lastName: '' },
                  ],
                })
              }
            >
              + Add
            </button>
          </div>
          {editForm.alternateNames.map((an, i) => (
            <div key={i} className={styles.altNameRow}>
              <select
                className={styles.formSelect}
                value={an.type}
                onChange={(e) => {
                  const updated = [...editForm.alternateNames];
                  updated[i] = { ...an, type: e.target.value };
                  onFormChange({ ...editForm, alternateNames: updated });
                }}
              >
                <option value="">Select type...</option>
                {Object.values(AlternateNameType).map((t) => (
                  <option key={t} value={t}>
                    {NAME_TYPE_LABELS[t] || t}
                  </option>
                ))}
              </select>
              <input
                type="text"
                className={styles.formInput}
                placeholder="First Name"
                value={an.firstName}
                onChange={(e) => {
                  const updated = [...editForm.alternateNames];
                  updated[i] = { ...an, firstName: e.target.value };
                  onFormChange({ ...editForm, alternateNames: updated });
                }}
              />
              <input
                type="text"
                className={styles.formInput}
                placeholder="Last Name"
                value={an.lastName}
                onChange={(e) => {
                  const updated = [...editForm.alternateNames];
                  updated[i] = { ...an, lastName: e.target.value };
                  onFormChange({ ...editForm, alternateNames: updated });
                }}
              />
              <button
                type="button"
                className={styles.btnRemoveEvent}
                onClick={() => {
                  const updated = editForm.alternateNames.filter((_, j) => j !== i);
                  onFormChange({ ...editForm, alternateNames: updated });
                }}
                title="Remove"
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        {/* Sources editor */}
        <div className={styles.eventsEditor}>
          <div className={styles.eventsEditorHeader}>
            <span className={styles.formLabel}>Sources</span>
            <button
              type="button"
              className={styles.btnAddEvent}
              onClick={() =>
                onFormChange({
                  ...editForm,
                  citations: [...editForm.citations, { sourceId: '', name: '', url: '' }],
                })
              }
            >
              + Add
            </button>
          </div>
          {editForm.citations.map((cit, i) => (
            <div key={i} className={styles.citationRow}>
              <input
                type="text"
                className={styles.formInput}
                placeholder="Name"
                value={cit.name}
                onChange={(e) => {
                  const updated = [...editForm.citations];
                  updated[i] = { ...cit, name: e.target.value, sourceId: '' };
                  onFormChange({ ...editForm, citations: updated });
                }}
              />
              <input
                type="text"
                className={styles.formInput}
                placeholder="URL (optional)"
                value={cit.url}
                onChange={(e) => {
                  const updated = [...editForm.citations];
                  updated[i] = { ...cit, url: e.target.value, sourceId: '' };
                  onFormChange({ ...editForm, citations: updated });
                }}
              />
              <button
                type="button"
                className={styles.btnRemoveEvent}
                onClick={() => {
                  const updated = editForm.citations.filter((_, j) => j !== i);
                  onFormChange({ ...editForm, citations: updated });
                }}
                title="Remove"
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        <div className={styles.formActions}>
          <button type="button" className={styles.btnSave} onClick={onSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" className={styles.btnCancel} onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
