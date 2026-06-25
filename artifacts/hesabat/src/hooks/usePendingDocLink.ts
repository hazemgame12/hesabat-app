export type PendingDocLink = {
  docId: string;
  docName: string;
  field: "journalEntryId" | "invoiceId" | "bankMovementId";
  direction?: "in" | "out";
};

const KEY = "pendingDocLink";

export function getPendingDocLink(): PendingDocLink | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v ? (JSON.parse(v) as PendingDocLink) : null;
  } catch {
    return null;
  }
}

export function setPendingDocLink(info: PendingDocLink): void {
  sessionStorage.setItem(KEY, JSON.stringify(info));
}

export function clearPendingDocLink(): void {
  sessionStorage.removeItem(KEY);
}

/** PATCH the document to link the given entityId, then clear sessionStorage. */
export async function linkPendingDoc(entityId: string): Promise<void> {
  const pending = getPendingDocLink();
  if (!pending) return;
  try {
    await fetch(`/api/documents/${pending.docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ [pending.field]: entityId }),
    });
  } finally {
    clearPendingDocLink();
  }
}
