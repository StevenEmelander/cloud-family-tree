import styles from './FlexDateInput.module.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Flexible date input: Year + optional Month + optional Day. Produces "YYYY", "YYYY-MM", or "YYYY-MM-DD". */
export function FlexDateInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const parts = value ? value.split('-') : [];
  const year = parts[0] || '';
  const month = parts[1] || '';
  const day = parts[2] || '';

  function assemble(y: string, m: string, d: string) {
    if (!y) {
      onChange('');
      return;
    }
    if (!m) {
      onChange(y);
      return;
    }
    if (!d) {
      onChange(`${y}-${m}`);
      return;
    }
    onChange(`${y}-${m}-${d}`);
  }

  const yearNum = Number.parseInt(year, 10);
  const monthNum = Number.parseInt(month, 10);
  const maxDay =
    year && month && !Number.isNaN(yearNum) && !Number.isNaN(monthNum)
      ? daysInMonth(yearNum, monthNum)
      : 31;

  return (
    <div className={styles.flexDate}>
      <input
        type="text"
        className={styles.flexDateYear}
        placeholder="YYYY"
        aria-label="Year"
        maxLength={4}
        value={year}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 4);
          assemble(v, month, day);
        }}
        disabled={disabled}
      />
      <select
        className={styles.flexDateSelect}
        aria-label="Month"
        value={month}
        onChange={(e) => {
          const m = e.target.value;
          assemble(year, m, m ? day : '');
        }}
        disabled={disabled || !year}
      >
        <option value="">--</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={String(i + 1).padStart(2, '0')}>
            {name}
          </option>
        ))}
      </select>
      <select
        className={styles.flexDateSelect}
        aria-label="Day"
        value={day}
        onChange={(e) => assemble(year, month, e.target.value)}
        disabled={disabled || !month}
      >
        <option value="">--</option>
        {Array.from({ length: maxDay }, (_, i) => {
          const dayVal = String(i + 1).padStart(2, '0');
          return (
            <option key={dayVal} value={dayVal}>
              {i + 1}
            </option>
          );
        })}
      </select>
    </div>
  );
}
