'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { siteConfig } from '@/lib/site-config';
import styles from './page.module.css';

const { about, adminEmail } = siteConfig;

/** Parse markdown-style [text](url) links and **bold** into React elements. */
function renderRichText(text: string): ReactNode[] {
  // Replace {{adminEmail}} template variable
  const resolved = text.replace(/\{\{adminEmail\}\}/g, adminEmail);

  // Split on markdown links and bold markers
  const parts = resolved.split(/(\[.*?\]\(.*?\)|\*\*.*?\*\*)/g);
  return parts.map((part) => {
    // Markdown link: [text](url)
    const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      const href = url ?? '';
      if (href.startsWith('mailto:') || href.startsWith('http')) {
        return (
          <a
            key={part}
            href={href}
            target={href.startsWith('http') ? '_blank' : undefined}
            rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
          >
            {label}
          </a>
        );
      }
      return (
        <Link key={part} href={href}>
          {label}
        </Link>
      );
    }
    // Bold: **text**
    const boldMatch = part.match(/^\*\*(.*?)\*\*$/);
    if (boldMatch) {
      return <strong key={part}>{boldMatch[1]}</strong>;
    }
    return part;
  });
}

/** Render a config string as paragraphs with rich text. */
function RichText({ text }: { text: string }) {
  const paragraphs = text.split('\n\n');
  return (
    <>
      {paragraphs.map((p) => (
        <p key={p}>{renderRichText(p)}</p>
      ))}
    </>
  );
}

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>About</h1>

      <div className={styles.storyCard}>
        <RichText text={about.dedication} />
        <p className={styles.signature}>{renderRichText(about.signature)}</p>
      </div>

      <h2 className={styles.faqTitle}>Frequently Asked Questions</h2>

      {about.faqSections.map((section) => (
        <div key={section.title} className={styles.faqSection}>
          <h3 className={styles.faqSectionTitle}>{section.title}</h3>
          {section.faqs.map((faq) => (
            <details key={faq.question} className={styles.faqItem}>
              <summary className={styles.faqQuestion}>
                <span className={styles.faqIcon}>{faq.icon}</span>
                {faq.question}
              </summary>
              <div className={styles.faqAnswer}>
                <RichText text={faq.answer} />
              </div>
            </details>
          ))}
        </div>
      ))}
    </div>
  );
}
