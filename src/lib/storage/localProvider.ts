import fs from "node:fs/promises";
import path from "node:path";
import { StorageProvider, PutObjectInput, PutObjectResult, buildStorageKey } from "./types";

/**
 * LocalStorageProvider — zero-dependency default so EZBILLZ runs fully
 * free/self-hosted with nothing but the filesystem. Not recommended for
 * multi-instance production deployments (use S3/MinIO there instead).
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "LOCAL" as const;

  constructor(private readonly rootDir: string = process.env.LOCAL_STORAGE_DIR || "./storage-data") {}

  private resolvePath(storageKey: string, organizationId: string): string {
    // Defense in depth: even though storageKey already embeds the org id
    // (see buildStorageKey), re-verify it belongs to the caller's tenant
    // before touching the filesystem.
    if (!storageKey.startsWith(`org/${organizationId}/`)) {
      throw new Error("Storage key does not belong to this organization");
    }
    const resolved = path.join(this.rootDir, storageKey);
    const normalizedRoot = path.resolve(this.rootDir);
    const normalizedResolved = path.resolve(resolved);
    if (!normalizedResolved.startsWith(normalizedRoot)) {
      // Prevents path traversal via a crafted storageKey.
      throw new Error("Invalid storage key");
    }
    return normalizedResolved;
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const storageKey = buildStorageKey(input.organizationId, input.purpose, input.filename);
    const filePath = this.resolvePath(storageKey, input.organizationId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.body);
    return { storageKey, sizeBytes: input.body.byteLength };
  }

  async getObject(storageKey: string, organizationId: string): Promise<Buffer> {
    const filePath = this.resolvePath(storageKey, organizationId);
    return fs.readFile(filePath);
  }

  async deleteObject(storageKey: string, organizationId: string): Promise<void> {
    const filePath = this.resolvePath(storageKey, organizationId);
    await fs.rm(filePath, { force: true });
  }
}
