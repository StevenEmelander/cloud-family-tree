'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

function GotoContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const name = searchParams.get('name') || '';
  const didLookup = useRef(false);

  useEffect(() => {
    if (!name || didLookup.current) return;
    didLookup.current = true;

    const parts = name.trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
    const middleParts = parts.slice(1, -1).join(' ').replace(/\./g, '').toUpperCase();
    const searchTerm = lastName ? `${firstName} ${lastName}` : firstName;

    api
      .listPeople({ search: searchTerm, limit: 20 })
      .then((data) => {
        if (data.items.length > 0) {
          // biome-ignore lint/style/noNonNullAssertion: guarded by data.items.length > 0 check above
          let best = data.items[0]!;
          if (middleParts) {
            const match = data.items.find((p) =>
              p.middleName?.replace(/\./g, '').toUpperCase().startsWith(middleParts),
            );
            if (match) best = match;
          }
          router.replace(`/people/${best.personId}`);
        } else {
          router.replace(`/?search=${encodeURIComponent(name)}`);
        }
      })
      .catch(() => {
        router.replace(`/?search=${encodeURIComponent(name)}`);
      });
  }, [name, router]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 1rem' }}>
      <p style={{ color: 'var(--color-secondary)', fontSize: '0.875rem' }}>Loading...</p>
    </div>
  );
}

export default function GotoPage() {
  return (
    <Suspense>
      <GotoContent />
    </Suspense>
  );
}
