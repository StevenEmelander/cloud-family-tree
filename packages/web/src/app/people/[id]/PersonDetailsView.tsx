'use client';

import type { Person, Source } from '@cloud-family-tree/shared';
import { formatDate } from '@/lib/date-utils';
import styles from './page.module.css';
import { CitationsSection, DetailRow, formatEventType, formatNameType } from './person-detail';

interface PersonDetailsViewProps {
  person: Person;
  sourcesMap: Record<string, Source>;
}

export function PersonDetailsView({ person, sourcesMap }: PersonDetailsViewProps) {
  return (
    <div className={styles.detailsCard}>
      <div className={styles.details}>
        <DetailRow label="Gender" value={person.gender} />
        {person.biography && <DetailRow label="Biography" value={person.biography} linkify />}
        {(() => {
          const allEvents: {
            type: string;
            date?: string;
            dateQualifier?: string;
            place?: string;
            detail?: string;
            artifactId?: string;
          }[] = [];
          if (person.birthDate || person.birthPlace)
            allEvents.push({
              type: 'BIRT',
              date: person.birthDate,
              dateQualifier: person.birthDateQualifier,
              place: person.birthPlace,
            });
          if (person.deathDate || person.deathPlace)
            allEvents.push({
              type: 'DEAT',
              date: person.deathDate,
              dateQualifier: person.deathDateQualifier,
              place: person.deathPlace,
            });
          if (person.burialPlace) allEvents.push({ type: 'BURI', place: person.burialPlace });
          if (person.events) allEvents.push(...person.events);
          // Track per-type index for matching eventIndex on citations
          const typeIndexMap: Record<string, number> = {};
          return allEvents.map((ev, i) => {
            const evIdx = typeIndexMap[ev.type] ?? 0;
            typeIndexMap[ev.type] = evIdx + 1;
            const eventCitations = (person.citations ?? []).filter((c) => {
              if (c.eventType !== ev.type) return false;
              // If citation has an eventIndex, match it to the correct event instance
              if (c.eventIndex !== undefined && c.eventIndex !== null)
                return c.eventIndex === evIdx;
              return true; // legacy citations without eventIndex show on all events of that type
            });
            return (
              <DetailRow
                key={`${ev.type}-${i}`}
                label={formatEventType(ev.type)}
                value={[ev.date && formatDate(ev.date, ev.dateQualifier), ev.place, ev.detail]
                  .filter(Boolean)
                  .join(' — ')}
                citations={eventCitations.length > 0 ? eventCitations : undefined}
                sourcesMap={sourcesMap}
              />
            );
          });
        })()}
        {person.alternateNames &&
          person.alternateNames.length > 0 &&
          person.alternateNames.map((an, i) => (
            <DetailRow
              key={`alt-${an.type}-${i}`}
              label={formatNameType(an.type)}
              value={[an.prefix, an.firstName, an.middleName, an.lastName, an.suffix]
                .filter(Boolean)
                .join(' ')}
            />
          ))}
      </div>
      {person.citations &&
        person.citations.filter((c) => !c.eventType || c.eventType === 'GENERAL').length > 0 && (
          <CitationsSection
            citations={person.citations.filter((c) => !c.eventType || c.eventType === 'GENERAL')}
            sourcesMap={sourcesMap}
          />
        )}
    </div>
  );
}
