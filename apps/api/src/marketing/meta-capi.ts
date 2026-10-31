import { createHash } from 'node:crypto';
import type { Env } from '../env';

const GRAPH_VERSION = 'v21.0';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
/** Meta's normalisation: trimmed, lower case, then SHA-256. Empty values are left out. */
const hashed = (value: string | null | undefined) => {
  const v = value?.trim().toLowerCase();
  return v ? [sha256(v)] : undefined;
};

export type PurchaseFacts = {
  orderNumber: string;
  createdAt: Date;
  totalPaisa: number;
  customerId: string;
  phone: string;
  email: string | null;
  name: string;
  city: string;
  items: { sku: string | null; quantity: number; unitPricePaisa: number }[];
};

export type BrowserContext = { ip: string | null; userAgent: string | null; fbp?: string; fbc?: string; sourceUrl?: string };

/**
 * One Conversions API Purchase event. event_id is the order number, the same id the browser
 * pixel sends, so Meta counts the purchase once. Personal details are hashed as Meta requires.
 */
export function purchaseEvent(order: PurchaseFacts, browser: BrowserContext) {
  return {
    event_name: 'Purchase',
    event_time: Math.floor(order.createdAt.getTime() / 1000),
    event_id: order.orderNumber,
    action_source: 'website',
    event_source_url: browser.sourceUrl,
    user_data: {
      ph: hashed(order.phone.replace(/\D/g, '')),
      em: hashed(order.email),
      fn: hashed(order.name.split(/\s+/)[0]),
      ct: hashed(order.city.replace(/\s+/g, '')),
      country: hashed('pk'),
      external_id: hashed(order.customerId),
      client_ip_address: browser.ip ?? undefined,
      client_user_agent: browser.userAgent ?? undefined,
      fbp: browser.fbp,
      fbc: browser.fbc,
    },
    custom_data: {
      currency: 'PKR',
      value: order.totalPaisa / 100,
      order_id: order.orderNumber,
      content_type: 'product',
      content_ids: order.items.map((i) => i.sku).filter(Boolean),
      contents: order.items.map((i) => ({ id: i.sku, quantity: i.quantity, item_price: i.unitPricePaisa / 100 })),
      num_items: order.items.reduce((s, i) => s + i.quantity, 0),
    },
  };
}

/** Sends events to Meta. Does nothing unless the pixel id and access token are configured. */
export async function sendMetaEvents(env: Pick<Env, 'META_PIXEL_ID' | 'META_CAPI_TOKEN' | 'META_TEST_EVENT_CODE'>, events: object[]) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return { sent: false as const };
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${env.META_PIXEL_ID}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Token in the body, not the URL, so it never shows up in proxy or access logs.
    body: JSON.stringify({ data: events, access_token: env.META_CAPI_TOKEN, ...(env.META_TEST_EVENT_CODE ? { test_event_code: env.META_TEST_EVENT_CODE } : {}) }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`Meta CAPI responded ${res.status}`);
  return { sent: true as const };
}
