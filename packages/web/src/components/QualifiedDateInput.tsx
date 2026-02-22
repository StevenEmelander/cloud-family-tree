import { FlexDateInput } from './FlexDateInput';
import styles from './QualifiedDateInput.module.css';

/** Combined qualifier dropdown + flexible date input. Produces a qualifier ("ABT", "BEF", "AFT", or "") and a date string ("YYYY", "YYYY-MM", or "YYYY-MM-DD"). */
export function QualifiedDateInput({
  qualifier,
  onQualifierChange,
  date,
  onDateChange,
  disabled,
}: {
  qualifier: string;
  onQualifierChange: (v: string) => void;
  date: string;
  onDateChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.wrapper}>
      <select
        className={styles.qualifierSelect}
        value={qualifier}
        onChange={(e) => onQualifierChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Exact</option>
        <option value="ABT">About</option>
        <option value="BEF">Before</option>
        <option value="AFT">After</option>
      </select>
      <FlexDateInput value={date} onChange={onDateChange} disabled={disabled} />
    </div>
  );
}
