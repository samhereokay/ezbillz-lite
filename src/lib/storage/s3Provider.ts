import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageProvider, PutObjectInput, PutObjectResult, buildStorageKey } from "./types";

/**
 * S3StorageProvider — works against AWS S3 or any S3-compatible endpoint
 * (MinIO for free self-hosting, DigitalOcean Spaces, Backblaze B2, etc.).
 * Configure via env vars so swapping between real AWS and self-hosted MinIO
 * requires no code change:
 *
 *   S3_ENDPOINT (optional — omit for real AWS, set for MinIO e.g. http://minio:9000)
 *   S3_REGION
 *   S3_BUCKET
 *   S3_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY
 *   S3_FORCE_PATH_STYLE (true for MinIO)
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = "S3" as const;
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = requireEnv("S3_BUCKET");
    this.client = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT, // undefined => real AWS
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
      },
    });
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const storageKey = buildStorageKey(input.organizationId, input.purpose, input.filename);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: input.body,
        ContentType: input.contentType,
        // Private by default — access only via getSignedDownloadUrl.
        ACL: "private",
      })
    );
    return { storageKey, sizeBytes: input.body.byteLength };
  }

  async getObject(storageKey: string, organizationId: string): Promise<Buffer> {
    assertOwnedByOrg(storageKey, organizationId);
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey })
    );
    const bytes = await res.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async getSignedDownloadUrl(
    storageKey: string,
    organizationId: string,
    expiresInSeconds = 300
  ): Promise<string> {
    assertOwnedByOrg(storageKey, organizationId);
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject(storageKey: string, organizationId: string): Promise<void> {
    assertOwnedByOrg(storageKey, organizationId);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }
}

function assertOwnedByOrg(storageKey: string, organizationId: string) {
  if (!storageKey.startsWith(`org/${organizationId}/`)) {
    throw new Error("Storage key does not belong to this organization");
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}
