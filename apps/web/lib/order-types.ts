import type { OrderStatus } from '@co/shared';

export type { OrderStatus };
export type OrderSource = 'WEBSITE' | 'WHATSAPP' | 'ADMIN';
export type PaymentStatus = 'PENDING' | 'AWAITING_VERIFICATION' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
export type PaymentMethod = 'COD' | 'BANK_TRANSFER' | 'RAAST' | 'JAZZCASH' | 'EASYPAISA' | 'SAFEPAY';
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'To confirm',
  CONFIRMATION_REQUIRED: 'Awaiting advance',
  CONFIRMED: 'Confirmed',
  IN_PRODUCTION: 'In production',
  READY_TO_DISPATCH: 'Ready to dispatch',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

export const STATUS_TONE: Record<OrderStatus, Tone> = {
  PENDING: 'warning',
  CONFIRMATION_REQUIRED: 'warning',
  CONFIRMED: 'brand',
  IN_PRODUCTION: 'brand',
  READY_TO_DISPATCH: 'brand',
  SHIPPED: 'neutral',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  RETURNED: 'danger',
};

/** Button wording for moving an order to a status. */
export const ACTION_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Back to pending',
  CONFIRMATION_REQUIRED: 'Await advance',
  CONFIRMED: 'Confirm order',
  IN_PRODUCTION: 'Start production',
  READY_TO_DISPATCH: 'Ready to dispatch',
  SHIPPED: 'Mark shipped',
  DELIVERED: 'Mark delivered',
  CANCELLED: 'Cancel order',
  RETURNED: 'Mark returned',
};

export const SOURCE_LABEL: Record<OrderSource, string> = { WEBSITE: 'Website', WHATSAPP: 'WhatsApp', ADMIN: 'Phone / in person' };

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  COD: 'Cash on delivery',
  BANK_TRANSFER: 'Bank transfer',
  RAAST: 'Raast',
  JAZZCASH: 'JazzCash',
  EASYPAISA: 'Easypaisa',
  SAFEPAY: 'Safepay',
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Not paid yet', tone: 'neutral' },
  AWAITING_VERIFICATION: { label: 'To verify', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  FAILED: { label: 'Not received', tone: 'danger' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  PARTIALLY_REFUNDED: { label: 'Part refunded', tone: 'neutral' },
};

export const PURPOSE_LABEL = { ADVANCE: 'Advance', BALANCE: 'Balance on delivery', FULL: 'Full amount', REFUND: 'Refund' } as const;

export type OrderListItem = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  source: OrderSource;
  createdAt: string;
  recipientName: string;
  recipientPhone: string;
  city: string | null;
  totalPaisa: number;
  itemCount: number;
  advanceStatus: PaymentStatus | null;
  personalizationPending: number;
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  source: OrderSource;
  createdAt: string;
  paymentMethod: PaymentMethod;
  subtotalPaisa: number;
  shippingPaisa: number;
  discountPaisa: number;
  totalPaisa: number;
  advanceRequiredPaisa: number;
  codAmountPaisa: number;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: { city: string; area?: string; addressLine: string; postalCode?: string };
  customerNote: string | null;
  internalNote: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  customer: { id: string; name: string; phone: string; email: string | null; _count: { orders: number } };
  items: {
    id: string;
    productTitleSnapshot: string;
    variantTitleSnapshot: string | null;
    skuSnapshot: string | null;
    quantity: number;
    unitPricePaisa: number;
    customizationPaisa: number;
    lineTotalPaisa: number;
    variant: { trackInventory: boolean; product: { id: string; slug: string } } | null;
    customization: { id: string; labelSnapshot: string; value: unknown; approvedAt: string | null }[];
  }[];
  payments: {
    id: string;
    method: PaymentMethod;
    purpose: keyof typeof PURPOSE_LABEL;
    status: PaymentStatus;
    amountPaisa: number;
    providerReference: string | null;
    paidAt: string | null;
    paymentAccount: { label: string } | null;
  }[];
  shipments: {
    id: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    status: string;
    codAmountPaisa: number;
    courier: { id: string; name: string };
  }[];
  statusHistory: { id: string; fromStatus: OrderStatus | null; toStatus: OrderStatus; note: string | null; actorName: string | null; createdAt: string }[];
};

export type NextStep = { status: OrderStatus; blocker: string | null };

const dateFmt = new Intl.DateTimeFormat('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' });
export const formatWhen = (iso: string) => dateFmt.format(new Date(iso));

/** wa.me link for a +92 number, optionally with a prefilled message. */
export function whatsappLink(phone: string, text?: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
