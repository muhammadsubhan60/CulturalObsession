import { fromNodeHeaders } from 'better-auth/node';
import type { RequestHandler } from 'express';
import type { Auth } from '../auth/auth';
import { isStaffRole, type StaffRole } from '../auth/roles';

export type StaffSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;

/** Verifies the session cookie on every request and, when given, that the staff role is allowed. */
export function requireStaff(auth: Auth, allowed?: readonly StaffRole[]): RequestHandler {
  return async (req, res, next) => {
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (!session) {
        res.status(401).json({ error: 'Not signed in' });
        return;
      }
      const role = session.user.role;
      if (session.user.banned || !isStaffRole(role) || (allowed && !allowed.includes(role))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.locals.session = session;
      next();
    } catch (err) {
      next(err);
    }
  };
}
