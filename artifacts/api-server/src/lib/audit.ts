import { db, auditLogTable } from "@workspace/db";

// Accepts either the top-level db handle or a transaction handle, so callers can
// record an audit row atomically inside a transaction or best-effort afterwards.
type DbOrTx =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AuditEntry = {
  companyId: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

// Append-only insert. May throw — use inside a transaction when the audit row
// must be atomic with the business write, or via `safeAudit` for best-effort.
export async function writeAudit(
  executor: DbOrTx,
  entry: AuditEntry,
): Promise<void> {
  await executor.insert(auditLogTable).values({
    companyId: entry.companyId,
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
  });
}

type MinimalLogger = { error: (obj: unknown, msg?: string) => void };

// Best-effort variant: never lets an audit failure break the business response.
// Use after a successful operation when the business write is already committed.
export async function safeAudit(
  executor: DbOrTx,
  entry: AuditEntry,
  log: MinimalLogger,
): Promise<void> {
  try {
    await writeAudit(executor, entry);
  } catch (err) {
    log.error(
      { err, audit: { entity: entry.entity, action: entry.action } },
      "Failed to write audit log",
    );
  }
}
