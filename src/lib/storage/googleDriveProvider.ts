import { google } from "googleapis";
import { Readable } from "node:stream";
import { prisma } from "../db/client";
import { decrypt, encrypt } from "../crypto";
import { StorageProvider, PutObjectInput, PutObjectResult } from "./types";

/**
 * Per-organization Google Drive provider. Unlike LocalStorageProvider and
 * S3StorageProvider (app-wide, chosen via STORAGE_PROVIDER), this one is
 * only used for a specific organization that has explicitly connected its
 * own Drive account under Settings > Storage — "bring your own cloud".
 *
 * OAuth tokens are stored encrypted at rest (see lib/crypto.ts, AES-256-GCM
 * with a server-side key) and are never sent to the browser. Scope requested
 * is drive.file only — access limited to files this app creates, not the
 * user's whole Drive.
 */
export class GoogleDriveProvider implements StorageProvider {
  readonly name = "GOOGLE_DRIVE" as const;

  private constructor(
    private readonly organizationId: string,
    private readonly accessToken: string,
    private readonly rootFolderId: string
  ) {}

  static async forOrganization(organizationId: string): Promise<GoogleDriveProvider> {
    const conn = await prisma.storageConnection.findUnique({
      where: { organizationId_provider: { organizationId, provider: "GOOGLE_DRIVE" } },
    });
    if (!conn || !conn.isActive) {
      throw new Error("Google Drive is not connected for this organization");
    }

    const accessToken = await ensureFreshAccessToken(conn);
    if (!conn.rootFolderId) {
      throw new Error("Google Drive connection is missing its EZBILLZ root folder");
    }
    return new GoogleDriveProvider(organizationId, accessToken, conn.rootFolderId);
  }

  private client() {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: this.accessToken });
    return google.drive({ version: "v3", auth });
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const drive = this.client();
    const res = await drive.files.create({
      requestBody: {
        name: input.filename,
        parents: [this.rootFolderId],
      },
      media: {
        mimeType: input.contentType,
        body: Readable.from(input.body),
      },
      fields: "id",
    });
    const remoteFileId = res.data.id!;
    return {
      storageKey: `gdrive/${this.organizationId}/${remoteFileId}`,
      remoteFileId,
      sizeBytes: input.body.byteLength,
    };
  }

  async getObject(storageKey: string): Promise<Buffer> {
    const remoteFileId = storageKey.split("/").pop()!;
    const drive = this.client();
    const res = await drive.files.get(
      { fileId: remoteFileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(res.data as ArrayBuffer);
  }

  async deleteObject(storageKey: string): Promise<void> {
    const remoteFileId = storageKey.split("/").pop()!;
    await this.client().files.delete({ fileId: remoteFileId });
  }
}

async function ensureFreshAccessToken(conn: {
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string;
  accessTokenExpiresAt: Date | null;
  organizationId: string;
}): Promise<string> {
  const stillValid =
    conn.encryptedAccessToken &&
    conn.accessTokenExpiresAt &&
    conn.accessTokenExpiresAt.getTime() > Date.now() + 60_000;

  if (stillValid) {
    return decrypt(conn.encryptedAccessToken!);
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: decrypt(conn.encryptedRefreshToken) });
  const { credentials } = await auth.refreshAccessToken();
  if (!credentials.access_token) {
    throw new Error("Failed to refresh Google Drive access token");
  }

  await prisma.storageConnection.update({
    where: { organizationId_provider: { organizationId: conn.organizationId, provider: "GOOGLE_DRIVE" } },
    data: {
      encryptedAccessToken: encrypt(credentials.access_token),
      accessTokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    },
  });

  return credentials.access_token;
}
