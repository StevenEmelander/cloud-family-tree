import PersonDetail from './person-detail';

// Return a placeholder to satisfy Next.js static export build.
// Real person IDs are handled client-side via CloudFront SPA fallback.
export async function generateStaticParams() {
  return [{ id: '_' }];
}

export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PersonDetail id={id} />;
}
