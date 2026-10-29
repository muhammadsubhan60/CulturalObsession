import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

/** Staff roles. Owners manage staff; managers run the store; staff handle orders. */
export const STAFF_ROLES = ['owner', 'manager', 'staff'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ac = createAccessControl(defaultStatements);

export const roles = {
  owner: ac.newRole({ ...adminAc.statements }),
  manager: ac.newRole({ user: [], session: [] }),
  staff: ac.newRole({ user: [], session: [] }),
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}
