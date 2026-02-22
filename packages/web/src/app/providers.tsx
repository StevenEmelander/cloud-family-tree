'use client';

import { Footer } from '@/components/footer';
import { Nav } from '@/components/nav';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import styles from './providers.module.css';

function PendingBanner() {
  const { user } = useAuth();
  if (!user || user.role !== null) return null;
  return (
    <div className={styles.pendingBanner}>
      Your account is pending approval. You can browse but cannot make edits.
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Nav />
      <PendingBanner />
      <main className={styles.main}>{children}</main>
      <Footer />
    </AuthProvider>
  );
}
