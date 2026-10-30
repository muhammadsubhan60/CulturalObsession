import { notFound } from 'next/navigation';

/** Any storefront URL without a route shows the theme's 404 page (not Next's default). */
export default function CatchAll() {
  notFound();
}
