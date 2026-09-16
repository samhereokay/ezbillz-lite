import { describe, it, expect, vi } from "vitest";
import { encrypt, decrypt } from "../src/lib/crypto";
import { LocalStorageProvider } from "../src/lib/storage/localProvider";
import { S3StorageProvider } from "../src/lib/storage/s3Provider";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "../src/server/tenant";
import { getServerSession } from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

describe("Security & Hardening Audits", () => {
  it("encrypts and decrypts OAuth tokens securely using AES-256-GCM", () => {
    // 32-byte key base64 encoded
    process.env.ENCRYPTION_KEY = Buffer.from("01234567890123456789012345678901").toString("base64");
    
    const secretToken = "ya29.a0ARrdaC8_GoogleOAuthRefreshTokenExample123456789";
    const encrypted = encrypt(secretToken);

    expect(encrypted).not.toBe(secretToken);
    expect(encrypted.length).toBeGreaterThan(32);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(secretToken);

    // Tampering test: modified ciphertext must fail GCM authentication check
    const tampered = encrypted.slice(0, -4) + "AAAA";
    expect(() => decrypt(tampered)).toThrow();
  });

  it("prevents path traversal attacks in local storage provider", async () => {
    const storage = new LocalStorageProvider("./test-storage");
    const maliciousKey = "org/org_123/../../../../etc/passwd";

    await expect(storage.getObject(maliciousKey, "org_123")).rejects.toThrow("Invalid storage key");
  });

  it("enforces strict tenant scoping on storage access", async () => {
    const storage = new LocalStorageProvider("./test-storage");
    const crossTenantKey = "org/victim_org_999/invoice_pdf/inv.pdf";

    await expect(storage.getObject(crossTenantKey, "attacker_org_111")).rejects.toThrow(
      "Storage key does not belong to this organization"
    );
  });

  it("requires authenticated session for requireOrgContext and rejects missing session", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    await expect(requireOrgContext("org_123")).rejects.toThrow(UnauthorizedError);
  });

  it("rejects unauthorized user membership in requireOrgContext (fail-closed IDOR protection)", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: "user_attacker" },
      expires: "2030-01-01",
    });

    // Mock Prisma findUnique to simulate attacker having NO membership in org_victim
    const { prisma } = await import("../src/lib/db/client");
    vi.spyOn(prisma.membership, "findUnique").mockResolvedValueOnce(null);

    await expect(requireOrgContext("org_victim")).rejects.toThrow(ForbiddenError);
  });
});
