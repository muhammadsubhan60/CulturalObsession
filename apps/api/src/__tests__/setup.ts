import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Local runs reuse packages/db/.env (docker-compose.dev.yml); CI sets DATABASE_URL directly.
config({ path: fileURLToPath(new URL('../../../../packages/db/.env', import.meta.url)), quiet: true });
