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

- **Railway** (project `unique-strength`, region `asia-southeast1-eqsg3a` / Singapore), root directory = repo root,
  builder Railpack, Node from `.node-version`. Settings live on the services (Railway no longer reads `railway.json`):

  | Service | Build | Start | Other |
  |---|---|---|---|
  | `@co/api` | `pnpm --filter @co/db generate && pnpm --filter @co/api build` | `pnpm --filter @co/api start` | pre-deploy `pnpm --filter @co/db migrate:deploy`, health `/health`, port 4000, domain `api.culturalobsession.deltalabs.tech` |
  | `@co/worker` | `pnpm --filter @co/db generate && pnpm --filter @co/worker build` | `pnpm --filter @co/worker start` | cron `*/15 * * * *`, restart never |
  | `Postgres` | — | — | referenced as `${{Postgres.DATABASE_URL}}` |

  API variables: see `apps/api/.env.example`.
- **Vercel:** project root `apps/web` (config `apps/web/vercel.json`).
- Web on the apex domain, API on `api.` subdomain — required for same-site admin cookies.

The locked theme comes from the public-site mirror described in [docs/MIRROR.md](docs/MIRROR.md).

### Media storage

Product photos go straight from the browser to an S3-compatible bucket (AWS S3 or Cloudflare R2)
through 5-minute presigned URLs; the API then checks the stored bytes before attaching them.
Set `S3_*` and `MEDIA_PUBLIC_URL` on the API (see `apps/api/.env.example`) and give the bucket a
CORS rule allowing `PUT` with the `Content-Type` header from the web origin. Product photos are
public via `MEDIA_PUBLIC_URL`; customer artwork (Phase 4) will use a separate private bucket.
Locally, `docker compose -f docker-compose.dev.yml up -d` starts PostgreSQL and SeaweedFS.
