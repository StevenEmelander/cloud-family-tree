import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: siteConfig.treeName,
  description: siteConfig.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
