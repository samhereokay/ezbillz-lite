import crypto from "node:crypto";

/**
 * Provider-agnostic storage interface. Business logic (invoice PDF
 * generation, logo upload, exports) depends only on this interface —
 * never on a concrete provider — so swapping Local -> S3 -> Google Drive
 * requires zero changes to invoice/document code.
 *
 * Transactional data (amounts, GST, stock) NEVER lives here — only file
 * bytes and the metadata needed to fetch them again. The database
 * (StoredFile model) is the record of "which provider + key" per file.
 */

export type PutObjectInput = {
  organizationId: string; // used to namespace the storage key — enforces tenant isolation at the storage layer too
  purpose: "invoice_pdf" | "logo" | "attachment" | "export";
  filename: string;
  contentType: string;
  body: Buffer;
};

export type PutObjectResult = {
  storageKey: string;
  remoteFileId?: string;
  sizeBytes: number;
};

export interface StorageProvider {
  readonly name: "LOCAL" | "S3" | "GOOGLE_DRIVE";
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getObject(storageKey: string, organizationId: string): Promise<Buffer>;
  getSignedDownloadUrl?(
    storageKey: string,
    organizationId: string,
    expiresInSeconds?: number
  ): Promise<string>;
  deleteObject(storageKey: string, organizationId: string): Promise<void>;
}

/**
 * Builds a tenant-namespaced key so one organization's files can never
 * collide with, or be guessed into, another's — this is the storage-layer
 * half of tenant isolation (the DB-layer half is StoredFile.organizationId).
 */
export function buildStorageKey(
  organizationId: string,
  purpose: string,
  filename: string
): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  return `org/${organizationId}/${purpose}/${unique}-${safeName}`;
}
