import { getPrisma } from '@co/db';
import { createAuth } from '../apps/api/src/auth/auth';
import { createStaffUser } from '../apps/api/src/auth/staff';
import { loadEnv } from '../apps/api/src/env';
import { E2E } from './fixtures';

/** Seeds one personalized product and one staff login, both reused across runs. */
export default async function globalSetup() {
  const prisma = getPrisma();
  try {
    const existing = await prisma.product.findUnique({ where: { slug: E2E.productSlug } });
    if (!existing) {
      await prisma.product.create({
        data: {
          title: E2E.productTitle,
          slug: E2E.productSlug,
          description: '<p>Test product for browser tests.</p>',
          status: 'ACTIVE',
          productType: 'PERSONALIZABLE',
          optionNames: [],
          variants: { create: { sku: 'E2E-NAME-1', title: 'Default', pricePaisa: 150_000, trackInventory: false } },
          templates: {
            create: {
              name: 'Name',
              fields: { create: { key: 'text-1', label: 'Customize Name', fieldType: 'text', required: true, config: { maxLength: 12 } } },
            },
          },
        },
      });
    }
    if (!(await prisma.user.findUnique({ where: { email: E2E.staffEmail } }))) {
      const env = loadEnv({
        ...process.env,
        API_URL: process.env.API_URL ?? 'http://localhost:4000',
        WEB_ORIGIN: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'e2e-secret-e2e-secret-e2e-secret-0000',
      });
      await createStaffUser(createAuth(env, prisma), { email: E2E.staffEmail, name: 'E2E Staff', password: E2E.staffPassword, role: 'staff' });
    }
  } finally {
    await prisma.$disconnect();
  }
}
