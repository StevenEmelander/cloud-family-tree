'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { displayRole, siteConfig } from '@/lib/site-config';
import styles from './nav.module.css';

function Icon({ d }: { d: string }) {
  return (
    <svg className={styles.itemIcon} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <title>icon</title>
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  addPerson:
    'M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3zm14-8h2v2h-2v2h-2v-2h-2v-2h2V8h2v2z',
  sources:
    'M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm2 10a1 1 0 000 2h4a1 1 0 100-2H8zm0-3a1 1 0 000 2h4a1 1 0 100-2H8z',
  review:
    'M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm5 3a1 1 0 000 2h2a1 1 0 100-2H9zm-1 4a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z',
  admin:
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  bug: 'M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1zm-2 5a1 1 0 00-1 1v1H3a1 1 0 100 2h2v1a6.002 6.002 0 005 5.917V12h2v5.917A6.002 6.002 0 0017 12v-1h2a1 1 0 100-2h-2V8a1 1 0 10-2 0v1H5a1 1 0 00-1-1zm3-3a4 4 0 118 0H6z',
  settings:
    'M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z',
  signOut:
    'M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm7 4.5a.5.5 0 01.5.5v2.5H13a.5.5 0 010 1h-2.5V14a.5.5 0 01-1 0v-2.5H7a.5.5 0 010-1h2.5V8a.5.5 0 01.5-.5z',
};

export function Nav() {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const isEditor = user?.role === 'admins' || user?.role === 'editors';

  if (pathname === '/login' || pathname === '/register') return null;

  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          {siteConfig.treeName}
        </Link>
        <div className={styles.actions}>
          <Link href="/about" className={styles.navBtn}>
            About
          </Link>
          {loading ? null : user ? (
            <div className={styles.dropdown}>
              <button type="button" className={styles.menuBtn} aria-label="Menu">
                <svg
                  className={styles.menuIcon}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <title>User menu</title>
                  <circle cx="12" cy="8" r="4" />
                  <path d="M12 14c-5.33 0-8 2.67-8 6v1h16v-1c0-3.33-2.67-6-8-6z" />
                </svg>
              </button>
              <div className={styles.dropdownMenu}>
                <div className={styles.menuHeader}>
                  <span className={styles.menuName}>{user.name}</span>
                  <span
                    className={`${styles.menuRole} ${user.role === 'admins' ? styles.menuRoleAdmin : user.role === 'editors' ? styles.menuRoleEditor : styles.menuRoleVisitor}`}
                  >
                    {displayRole(user.role)}
                  </span>
                </div>

                {isEditor && (
                  <div className={styles.menuGroup}>
                    <Link href="/people/new" className={styles.dropdownItem}>
                      <Icon d={ICONS.addPerson} />
                      Add Person
                    </Link>
                    <Link href="/sources" className={styles.dropdownItem}>
                      <Icon d={ICONS.sources} />
                      Sources
                    </Link>
                    <Link href="/review-issues" className={styles.dropdownItem}>
                      <Icon d={ICONS.review} />
                      Review Issues
                    </Link>
                    {user.role === 'admins' && (
                      <Link href="/admin" className={styles.dropdownItem}>
                        <Icon d={ICONS.admin} />
                        Admin
                      </Link>
                    )}
                  </div>
                )}

                <div className={styles.menuGroup}>
                  <Link href="/report-bug" className={styles.dropdownItem}>
                    <Icon d={ICONS.bug} />
                    Report Bug
                  </Link>
                  <Link href="/settings" className={styles.dropdownItem}>
                    <Icon d={ICONS.settings} />
                    Settings
                  </Link>
                </div>

                <div className={styles.menuGroup}>
                  <button
                    type="button"
                    onClick={signOut}
                    className={`${styles.dropdownItem} ${styles.signOutItem}`}
                  >
                    <svg
                      className={styles.itemIcon}
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <title>Sign out</title>
                      <path d="M13 3h3a1 1 0 011 1v12a1 1 0 01-1 1h-3M8 14l-4-4m0 0l4-4m-4 4h12" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Link href="/login" className={styles.signInLink}>
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
