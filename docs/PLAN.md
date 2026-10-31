# Cultural Obsession — Implementation Plan

Rebuild of the customizedjewellers.pk Shopify store as our own ecommerce platform.
Finalized 2026-10-30. Progress is tracked in Workly24 (Delta Labs → project "Cultural Obsession").

## Fixed decisions

- **Frontend is locked.** The storefront keeps the current Dawn theme exactly (layout, CSS,
  fonts, colours, copy, URLs). Source of truth: `customizedjewellers-mirror/site/`.
- **Hosting:** everything on **Railway** in Singapore (`asia-southeast1-eqsg3a`): `@co/web` (Next.js),
  `@co/api`, `@co/worker` (cron) and PostgreSQL. Web on `culturalobsession.deltalabs.tech`, API on
  `api.culturalobsession.deltalabs.tech`, so admin cookies stay same-site. (Changed from Vercel on
  2026-10-30: Hobby plan forbids commercial use and the repo could not be linked.)
- **Database:** PostgreSQL + Prisma. Money stored as integer paisa.
- **Admin UI only:** Tailwind + shadcn/ui + 21st.dev + UI UX Pro Max, scoped to `/admin`.
  Never loaded on storefront pages (Tailwind preflight would break Dawn).
- **Auth:** Better Auth for admin staff (email/password, roles, 2FA). Customers check out as guests;
  order tracking by order number + phone.
- **Payments:** COD for ready-made items. Advance payment for personalized items is driven by
  admin-configured `AdvancePaymentRule`s (never hardcoded). Raast / bank / JazzCash / Easypaisa
  details live in admin settings. Safepay later.
- **Inventory:** `trackInventory` per variant; made-to-order items skip stock reservation.
- **Couriers:** shared adapter interface; manual booking first; PostEx, Trax, Leopards first adapters.
- **Media:** Cloudflare R2 (S3-compatible, no egress fees): public bucket for product photos, private bucket for customer artwork.

## Repository layout

```
apps/web      Next.js storefront (Dawn port) + /admin   → Railway
apps/api      Node API: catalogue, checkout, orders, couriers, payments, webhooks → Railway
apps/worker   Cron jobs: reservation expiry, courier polling, pg_dump → S3     → Railway
packages/db   Prisma schema, migrations, client (used by api + worker only)
packages/shared  Zod schemas, types, money helpers (used everywhere)
```

## Phases

### Phase 0 — Repo & infrastructure
1. pnpm monorepo, TypeScript, ESLint, Prettier, Vitest, GitHub Actions CI
2. `apps/web`, `apps/api`, `apps/worker`, `packages/db`, `packages/shared` scaffolds
3. Railway project: api service, PostgreSQL, worker service (asia-southeast)
4. Railway web service for `apps/web` and env var wiring
5. Domain + DNS: web on apex, `api.` subdomain on Railway, HTTPS
6. `.env.example` files for every app (no secrets committed)

### Phase 1 — Foundation & data model
1. Prisma schema: catalogue, inventory, customers, orders, payments, couriers, shipments, history
2. Added models: AdvancePaymentRule, StoreSetting, PaymentAccount, User/Role, AuditLog
3. CHECK constraints (non-negative money, quantity > 0) via SQL migration
4. Better Auth admin login, roles, rate limiting, seed first admin securely
5. Admin shell (`/admin`) with Tailwind/shadcn scoped styles
6. Product, variant, category, image and inventory CRUD in admin
7. S3/R2 uploads with signed URLs, MIME/size validation, UUID keys

### Phase 2 — Storefront port (locked theme)
1. Port Dawn CSS, fonts and assets from the mirror unchanged
2. Header, announcement bar, footer, navigation as React components (same classes/markup)
3. Home page sections fed from the database
4. Collection pages (`/collections/[slug]`) with sorting/filtering as on the live site
5. Product page (`/products/[slug]`) incl. "Customize Name" field, quantity, Shop Now
6. Info pages (`/pages/*`) and blog (`/blogs/news`)
7. Search (Postgres pg_trgm)
8. Catalogue import from Shopify products CSV export + images to S3
9. SEO parity: titles, meta, canonical, sitemap.xml, robots.txt, 301s for Shopify-only URLs
10. Pixel comparison against mirror screenshots (desktop + mobile)

### Phase 3 — Cart & checkout
1. Cart (drawer/page as in current theme), server-side price recalculation
2. Checkout form: name, phone (+92 normalisation), city, address — COD
3. Advance payment flow driven by AdvancePaymentRule (proof upload / reference entry)
4. Transactional order creation: items, snapshots, reservation, status history
5. Idempotency keys + checkout rate limiting / abuse protection
6. Order confirmation page and track-order page (order number + phone)

### Phase 5 — Admin operations & WhatsApp
1. Order inbox: filters, status changes, history, internal notes
2. Personalization approval step before production
3. WhatsApp click-to-chat with product + customization details (existing widget look)
4. Admin-created / WhatsApp-sourced orders in the same workflow
5. Advance payment verification queue
6. Courier selection, manual tracking numbers, adapter interface
7. Settings pages: store, advance rules, payment accounts, couriers

### Phase 6 — Production readiness & launch
1. GA4, Meta Pixel + CAPI (dedup), Search Console, UTM persistence into orders
2. Sentry, health checks, uptime alerts
3. Daily pg_dump to encrypted S3 + restore test
4. E2E tests: order, stock, cancellation, return, tampered price, double submit
5. Mobile, accessibility and performance review against the mirror
6. Go-live checklist, DNS cutover from Shopify, rollback plan

### Phase 7 — After launch (P1)
1. Courier API booking + webhooks (PostEx, Trax, Leopards)
2. JazzCash / Easypaisa / Safepay online payments
3. WhatsApp Cloud API order confirmation messages
4. Coupons, reviews, abandoned checkout recovery, delivered-revenue reporting

### Phase 4 — Personalization engine (deferred — last)
Deferred by the owner on 2026-10-31: built after every other phase. Until then products keep the
theme's "Customize Name" field, validated server-side and saved on each order line.

1. Field types: engraving text, font, colour, size, gift message (template config)
2. 2D SVG/canvas preview inside the existing product form styling
3. Arabic/Urdu shaping fonts for calligraphy products (license checked)
4. Server validation of lengths, characters and extra prices
5. Save selections, preview and artwork references on order items
