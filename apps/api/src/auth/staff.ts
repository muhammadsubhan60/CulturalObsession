import type { Auth } from './auth';
import type { StaffRole } from './roles';

/**
 * Creates a staff login directly through Better Auth's internal adapter (public sign-up is disabled).
 * Used by the seed script and tests; the admin UI uses the admin plugin's createUser endpoint.
 */
export async function createStaffUser(
  auth: Auth,
  input: { email: string; name: string; password: string; role: StaffRole },
) {
  const ctx = await auth.$context;
  const email = input.email.trim().toLowerCase();
  if (await ctx.internalAdapter.findUserByEmail(email)) {
    throw new Error(`A staff account already exists for ${email}`);
  }
  if (input.password.length < 12) throw new Error('Password must be at least 12 characters');

  const user = await ctx.internalAdapter.createUser(
    { email, name: input.name, emailVerified: true, role: input.role },
    { method: 'admin' },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await ctx.password.hash(input.password),
  });
  return user;
}
