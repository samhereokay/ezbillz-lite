import { expect, test, describe, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "../../src/lib/db/client";
import { authOptions } from "../../src/lib/auth/options";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "../../src/server/tenant";
import * as nextAuth from "next-auth";
import crypto from "crypto";

vi.mock("next-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth")>();
  return {
    ...actual,
    getServerSession: vi.fn(),
  };
});

describe("Phase 2 Authentication Security", () => {
  let userA: any, orgA: any, orgB: any, membershipA: any;
  const rawPassword = "SecurePassword123!";

  beforeAll(async () => {
    const uniqueSuffix = crypto.randomUUID().substring(0, 8);
    
    orgA = await prisma.organization.create({
      data: { name: `Org A ${uniqueSuffix}`, state: "MH", stateCode: "27" }
    });
    orgB = await prisma.organization.create({
      data: { name: `Org B ${uniqueSuffix}`, state: "KA", stateCode: "29" }
    });

    const signupReq = {
      json: async () => ({
        name: "Test User A",
        email: `testA_${uniqueSuffix}@example.com`,
        password: rawPassword,
        businessName: "Business A",
        state: "MH",
        stateCode: "27"
      })
    } as any;

    const { POST } = await import("../../src/app/api/auth/signup/route");
    const res = await POST(signupReq);
    const data = await res.json();
    
    userA = await prisma.user.findUnique({ where: { id: data.userId } });
    membershipA = await prisma.membership.findFirst({ where: { userId: userA.id, organizationId: data.organizationId } });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  test("1. Unauthenticated request -> 401/appropriate rejection", async () => {
    vi.mocked(nextAuth.getServerSession).mockResolvedValueOnce(null);
    await expect(requireOrgContext()).rejects.toThrow(UnauthorizedError);
  });

  test("2. Valid authenticated session -> authorized request succeeds", async () => {
    vi.mocked(nextAuth.getServerSession).mockResolvedValueOnce({ user: { id: userA.id } } as any);
    const ctx = await requireOrgContext();
    expect(ctx.userId).toBe(userA.id);
    expect(ctx.organizationId).toBe(membershipA.organizationId);
  });

  test("3/4. Invalid credentials and wrong password -> rejected", async () => {
    const provider = authOptions.providers[0] as any;
    
    // Wrong password
    const resultWrongPwd = await provider.options.authorize({ email: userA.email, password: "WrongPassword!" }, {} as any);
    expect(resultWrongPwd).toBeNull();

    // Invalid email
    const resultWrongUser = await provider.options.authorize({ email: "doesnotexist@example.com", password: "Password!" }, {} as any);
    expect(resultWrongUser).toBeNull();
  });

  test("7/8. Client cannot substitute another user ID or org ID", async () => {
    // Attempting to request orgB context while logged in as userA
    vi.mocked(nextAuth.getServerSession).mockResolvedValueOnce({ user: { id: userA.id } } as any);
    await expect(requireOrgContext(orgB.id)).rejects.toThrow(ForbiddenError);
  });

  test("JWT callback ignores client-injected ID unless user object explicitly provided from authorize", async () => {
    const jwtCallback = authOptions.callbacks?.jwt as any;
    
    // If client sends a tampered token with a fake userId, but no user object (subsequent requests)
    const token = { userId: "fake-id" };
    const result = await jwtCallback({ token, user: undefined });
    expect(result.userId).toBeUndefined(); // Phase 10 session checking explicitly rejects non-existent DB users.
    
    // If logging in (user is present), the token is strictly overwritten
    const loginToken = { userId: "attacker-id" };
    const resultLogin = await jwtCallback({ token: loginToken, user: { id: userA.id, sessionVersion: userA.sessionVersion } });
    expect(resultLogin.userId).toBe(userA.id);
  });

  test("Expiration is configured for 24 hours", () => {
    expect(authOptions.session?.maxAge).toBe(86400); // 24 * 60 * 60
  });

  test("5/6. Real JWT Tamper Test: tampered/expired JWT rejected", async () => {
    const { encode, decode } = await import("next-auth/jwt");
    const secret = "test-secret-for-jwt-verification-must-be-32-chars-long";
    
    // Create a valid token
    const validToken = await encode({
      token: { userId: "real-id", exp: Math.floor(Date.now() / 1000) + 3600 },
      secret
    });
    
    // Tamper with payload (next-auth uses JWE by default, which has 5 parts)
    const parts = validToken.split(".");
    // Just modify the ciphertext/payload part
    if (parts.length >= 2) {
      parts[parts.length - 2] = "tampered" + parts[parts.length - 2].substring(8);
    }
    const tamperedToken = parts.join(".");
    
    // Verify tampered token is rejected (decode returns null or throws)
    // next-auth/jwt decode returns null on failure if token is tampered
    let decodedTampered = null;
    try {
      decodedTampered = await decode({ token: tamperedToken, secret });
    } catch (e) {
      decodedTampered = null;
    }
    expect(decodedTampered).toBeNull();
    
    // Create expired token (NextAuth checks maxAge or exp claim if it exists in token)
    // If we specify maxAge to encode, it overrides. Let's just create a token and let it decode.
    // next-auth decode checks JWE/JWS. By default it uses JWE (encrypted). 
    // Wait, next-auth/jwt encode produces a JWE encrypted token by default, so tampering the payload directly won't even parse correctly! It's encrypted, not just signed!
    // But testing that it rejects the tampered token is still valid.
    
    const expiredToken = await encode({
      token: { userId: "real-id", name: "test" },
      secret,
      maxAge: -3600 // Expired 1 hour ago
    });
    
    // The real verification path in NextAuth uses getToken which checks expiration
    const { getToken } = await import("next-auth/jwt");
    const req = {
      cookies: {
        "next-auth.session-token": expiredToken
      },
      headers: {}
    } as any;
    
    const tokenFromReq = await getToken({ req, secret });
    expect(tokenFromReq).toBeNull();
  });
});
