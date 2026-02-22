import PersonDetail from './person-detail';

// Return a placeholder to satisfy Next.js static export build.
// Real person IDs are handled client-side via CloudFront SPA fallback.
export async function generateStaticParams() {
  return [{ id: '_' }];
}

export default function PersonDetailPage({ params }: { params: { id: string } }) {
  return <PersonDetail id={params.id} />;
}
