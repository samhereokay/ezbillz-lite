import { StorageProvider } from "./types";
import { LocalStorageProvider } from "./localProvider";
import { S3StorageProvider } from "./s3Provider";

export * from "./types";

let cached: StorageProvider | null = null;

/**
 * Selects the active storage provider from STORAGE_PROVIDER env var.
 * Defaults to LOCAL so `docker compose up` works with zero cloud config
 * (free-first principle). Set STORAGE_PROVIDER=S3 to point at MinIO or
 * real AWS S3 using the S3_* env vars (see s3Provider.ts).
 *
 * Google Drive is intentionally NOT the default provider here — it's a
 * per-organization, user-connected destination (see StorageConnection in
 * the Prisma schema) selected explicitly in Settings > Storage, not a
 * global app-wide provider. Its adapter lives in googleDriveProvider.ts
 * and is invoked only for orgs that have connected it.
 */
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const kind = process.env.STORAGE_PROVIDER || "LOCAL";
  switch (kind) {
    case "S3":
      cached = new S3StorageProvider();
      break;
    case "LOCAL":
    default:
      cached = new LocalStorageProvider();
      break;
  }
  return cached;
}
