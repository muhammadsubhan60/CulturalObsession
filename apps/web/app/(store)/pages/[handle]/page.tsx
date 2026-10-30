import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StoreChrome } from '@/components/store/chrome';
import { renderTheme } from '@/lib/theme/render';
import { pageHandles, pageSections } from '@/lib/theme/sections';

type Params = Promise<{ handle: string }>;

export const dynamicParams = false;
export function generateStaticParams() {
  return pageHandles().map((handle) => ({ handle }));
}

function titleOf(html: string) {
  return /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]?.replace(/<[^>]+>/g, '').trim();
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { handle } = await params;
  const sections = pageSections(handle);
  return sections ? { title: titleOf(sections.main), alternates: { canonical: `/pages/${handle}` } } : {};
}

/** Info pages (policies, about, contact) exactly as the theme rendered them. */
export default async function InfoPage({ params }: { params: Params }) {
  const { handle } = await params;
  const sections = pageSections(handle);
  if (!sections) notFound();
  return (
    <StoreChrome template={sections.contactForm ? 'contact' : 'page'} currentPath={`/pages/${handle}`}>
      {renderTheme(sections.main)}
      {sections.contactForm && renderTheme(sections.contactForm)}
    </StoreChrome>
  );
}

