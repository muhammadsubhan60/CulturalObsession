import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { purchaseEvent, sendMetaEvents } from '../marketing/meta-capi';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');

const order = {
  orderNumber: 'CO-100123',
  createdAt: new Date('2026-10-31T10:00:00Z'),
  totalPaisa: 219_800,
  customerId: 'cust_1',
  phone: '+923001234567',
  email: ' Ayesha@Example.PK ',
  name: 'Ayesha Khan',
  city: 'Rahim Yar Khan',
  items: [{ sku: 'CO-0001-1', quantity: 2, unitPricePaisa: 109_900 }],
};

afterEach(() => vi.unstubAllGlobals());

describe('Meta Conversions API', () => {
  it('builds a Purchase that dedupes with the pixel and hashes personal details', () => {
    const e = purchaseEvent(order, { ip: '203.0.113.9', userAgent: 'UA', fbp: 'fb.1.1700000000.123' });
    expect(e).toMatchObject({ event_name: 'Purchase', event_id: 'CO-100123', event_time: 1793440800, action_source: 'website' });
    expect(e.user_data.ph).toEqual([sha('923001234567')]);
    expect(e.user_data.em).toEqual([sha('ayesha@example.pk')]);
    expect(e.user_data.fn).toEqual([sha('ayesha')]);
    expect(e.user_data.ct).toEqual([sha('rahimyarkhan')]);
    expect(e.custom_data).toMatchObject({ currency: 'PKR', value: 2198, num_items: 2, content_ids: ['CO-0001-1'] });
    expect(JSON.stringify(e)).not.toMatch(/Ayesha|3001234567/);
  });

  it('does nothing until a pixel id and token are configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await sendMetaEvents({ META_PIXEL_ID: '544602636822818' }, [{}])).toEqual({ sent: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the token in the body, never in the URL', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    await sendMetaEvents({ META_PIXEL_ID: '544602636822818', META_CAPI_TOKEN: 'EAAB-test-token-value-123456' }, [{ event_name: 'Purchase' }]);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://graph.facebook.com/v21.0/544602636822818/events');
    expect(url).not.toContain('token');
    expect(JSON.parse(init.body)).toMatchObject({ access_token: 'EAAB-test-token-value-123456', data: [{ event_name: 'Purchase' }] });
  });
});
