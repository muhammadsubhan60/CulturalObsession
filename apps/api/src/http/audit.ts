import type { PrismaClient } from '@co/db';
import type { Request, Response } from 'express';
import type { StaffSession } from './require-staff';

type Tx = Pick<PrismaClient, 'auditLog'>;

/** Records who changed what. Call inside the same transaction as the change when there is one. */
export function audit(
  db: Tx,
  req: Request,
  res: Response,
  entry: { action: string; entityType: string; entityId?: string; metadata?: Record<string, unknown> },
) {
  const session = res.locals.session as StaffSession | undefined;
  return db.auditLog.create({
    data: {
      actorUserId: session?.user.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: (entry.metadata ?? {}) as object,
      ipAddress: req.ip ?? null,
    },
  });
}
