# Cultural Obsession

Our own ecommerce platform replacing the customizedjewellers.pk Shopify store.
The storefront keeps the current theme exactly; see [docs/PLAN.md](docs/PLAN.md).

| Path | What | Deploys to |
|---|---|---|
| `apps/web` | Next.js storefront + `/admin` | Vercel (`sin1`) |
| `apps/api` | Express API | Railway (`asia-southeast`) |
| `apps/worker` | Cron jobs | Railway cron |
| `packages/db` | Prisma schema + client | — |
| `packages/shared` | Money, phone, shared Zod schemas | — |

## Develop

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @co/db generate
pnpm --filter @co/api dev     # http://localhost:4000/health
pnpm --filter @co/web dev     # http://localhost:3000
```

Checks: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Deploy

- **Railway:** one project with PostgreSQL, an `api` service (config `apps/api/railway.json`)
  and a `worker` cron service (`apps/worker/railway.json`). Root directory stays the repo root.
- **Vercel:** project root `apps/web` (config `apps/web/vercel.json`).
- Web on the apex domain, API on `api.` subdomain — required for same-site admin cookies.

The locked theme comes from the public-site mirror described in [docs/MIRROR.md](docs/MIRROR.md).
