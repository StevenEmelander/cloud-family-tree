'use client';

import styles from './footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p className={styles.powered}>
          Built with{' '}
          <a
            className={styles.link}
            href="https://github.com/StevenEmelander/cloud-family-tree"
            target="_blank"
            rel="noopener noreferrer"
          >
            CloudFamilyTree
          </a>
        </p>
      </div>
    </footer>
  );
}
