/**
 * Meta Pixel + GA4 loader. Ids come from server env (META_PIXEL_ID, GA4_MEASUREMENT_ID); with
 * neither set nothing is rendered. The script is an external file, so no inline JS is needed.
 */
export function Analytics() {
  const pixel = process.env.META_PIXEL_ID?.match(/^\d{10,20}$/)?.[0];
  const ga4 = process.env.GA4_MEASUREMENT_ID?.match(/^G-[A-Z0-9]{6,12}$/)?.[0];
  if (!pixel && !ga4) return null;
  return <script src="/storefront/analytics.js" defer data-pixel={pixel} data-ga4={ga4} />;
}
