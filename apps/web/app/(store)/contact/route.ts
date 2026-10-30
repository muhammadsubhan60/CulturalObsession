import { headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { storePost } from '@/lib/store-api';

/**
 * The theme's contact and newsletter forms post here, as they posted to Shopify's /contact.
 * Like Shopify, the shopper returns to the page they came from with a *_posted flag that the
 * storefront's forms script turns into the theme's success message.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || h.get('x-real-ip') || null;
  const isNewsletter = get('form_type') === 'customer';

  const { status } = isNewsletter
    ? await storePost('/newsletter', { email: get('contact[email]') }, ip)
    : await storePost(
        '/contact',
        { name: get('contact[Name]'), email: get('contact[email]'), phone: get('contact[Phone number]'), message: get('contact[Comment]') },
        ip,
      );

  const back = safeReturnPath(h.get('referer'), req.nextUrl.origin);
  const flag = isNewsletter ? 'customer' : 'contact';
  back.searchParams.delete('customer_posted');
  back.searchParams.delete('contact_posted');
  back.searchParams.delete('form_error');
  if (status === 201) back.searchParams.set(`${flag}_posted`, 'true');
  else back.searchParams.set('form_error', status === 429 ? `${flag}-limited` : `${flag}-invalid`);
  const formId = get('form_id');
  back.hash = formId && /^[A-Za-z0-9_-]{1,80}$/.test(formId) ? formId : isNewsletter ? 'contact_form' : 'ContactForm';
  return NextResponse.redirect(back, 303);
}

/** Only ever redirect to a path on this site. */
function safeReturnPath(referer: string | null, origin: string): URL {
  try {
    const url = new URL(referer ?? '/', origin);
    if (url.origin === origin) return url;
  } catch {
    // fall through
  }
  return new URL('/', origin);
}
