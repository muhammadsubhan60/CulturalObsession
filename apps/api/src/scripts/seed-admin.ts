/**
 * Creates the first owner account. The password is read from ADMIN_PASSWORD so it never
 * appears in shell history or process arguments:
 *
 *   read -s ADMIN_PASSWORD && export ADMIN_PASSWORD
 *   ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" pnpm --filter @co/api seed:admin
 */
import { getPrisma } from '@co/db';
import { createAuth } from '../auth/auth';
import { createStaffUser } from '../auth/staff';
import { loadEnv } from '../env';

const { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_NAME || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD');
  process.exit(1);
}

const prisma = getPrisma();
try {
  const user = await createStaffUser(createAuth(loadEnv(), prisma), {
    email: ADMIN_EMAIL,
    name: ADMIN_NAME,
    password: ADMIN_PASSWORD,
    role: 'owner',
  });
  console.log(`Owner account created: ${user.email}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
