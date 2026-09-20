import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db/client";
import { authOptions } from "../../src/lib/auth/options";
import crypto from "crypto";
import * as argon2 from "argon2";

describe("Phase 10 Session Revocation", () => {
  let user: any;
  const rawPassword = "SecurePassword123!";

  beforeAll(async () => {
    const uniqueSuffix = crypto.randomUUID().substring(0, 8);
    const passwordHash = await argon2.hash(rawPassword);
    
    user = await prisma.user.create({
      data: {
        name: "Test User Session",
        email: `session_test_${uniqueSuffix}@example.com`,
        passwordHash,
        sessionVersion: 1
      }
    });
  });

  afterAll(async () => {
    // Cleanup not strictly necessary in test DB if isolated, but good practice
    if (user?.id) {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  test("Session A and Session B fail when sessionVersion is incremented globally", async () => {
    const jwtCallback = authOptions.callbacks?.jwt as any;
    const sessionCallback = authOptions.callbacks?.session as any;

    // Simulate login for Session A
    let tokenA = await jwtCallback({ token: {}, user });
    
    // Simulate login for Session B (from another device)
    let tokenB = await jwtCallback({ token: {}, user });

    expect(tokenA.sessionVersion).toBe(1);
    expect(tokenB.sessionVersion).toBe(1);
    
    // Simulate subsequent request using Session A (verify against DB)
    // The jwt callback will look up the current sessionVersion from the DB (which is still 1)
    let validatedTokenA = await jwtCallback({ token: tokenA, user: undefined });
    expect(validatedTokenA.userId).toBe(user.id);
    
    let activeSessionA = await sessionCallback({ session: { user: {} }, token: validatedTokenA });
    expect(activeSessionA.user.id).toBe(user.id);

    // --- LOGOUT / PASSWORD CHANGE SIMULATION ---
    // Increment the global sessionVersion in the database
    await prisma.user.update({
      where: { id: user.id },
      data: { sessionVersion: { increment: 1 } }
    });

    // --- VERIFY REVOCATION ---
    // Both Session A and Session B present their old tokens (with version 1)
    // The jwt callback should look up the DB (which is now 2) and reject them.
    let revokedTokenA = await jwtCallback({ token: tokenA, user: undefined });
    let revokedTokenB = await jwtCallback({ token: tokenB, user: undefined });

    // The token should have been cleared (empty object {})
    expect(revokedTokenA.userId).toBeUndefined();
    expect(revokedTokenB.userId).toBeUndefined();

    // The session callback should return an empty object or a session without user.id
    let failedSessionA = await sessionCallback({ session: { user: {} }, token: revokedTokenA });
    let failedSessionB = await sessionCallback({ session: { user: {} }, token: revokedTokenB });

    expect(failedSessionA.user).toBeUndefined();
    expect(failedSessionB.user).toBeUndefined();
    
    // --- VERIFY FRESH LOGIN WORKS ---
    // User logs in again, retrieving the new sessionVersion (2)
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    let tokenC = await jwtCallback({ token: {}, user: updatedUser });
    expect(tokenC.sessionVersion).toBe(2);
    
    let validatedTokenC = await jwtCallback({ token: tokenC, user: undefined });
    expect(validatedTokenC.userId).toBe(user.id);
  });
});
