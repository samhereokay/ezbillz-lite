import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../src/middleware";
import { vi } from "vitest";

describe("Middleware Rate Limiter Security", () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  const runRequests = async (headers: Record<string, string>, count: number) => {
    let lastStatus = 200;
    for (let i = 0; i < count; i++) {
      const req = new NextRequest(new URL("http://localhost/api/auth/test"), {
        headers,
      });
      const res = middleware(req);
      if (res.status === 429) {
        lastStatus = 429;
      }
    }
    return lastStatus;
  };

  test("Case 1 - spoofed forwarded header cannot bypass rate limiting in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // Send 16 requests with X-Forwarded-For: 127.0.0.1 (which shouldn't bypass as isLocal in prod)
    const status = await runRequests({ "x-forwarded-for": "127.0.0.1" }, 16);
    expect(status).toBe(429);
  });

  test("Case 2 - spoofed X-Real-IP cannot bypass rate limiting in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // Send 16 requests with X-Real-IP: 127.0.0.1
    const status = await runRequests({ "x-real-ip": "127.0.0.1" }, 16);
    expect(status).toBe(429);
  });

  test("Case 4 - repeated requests from same effective identity trigger limit exactly as before", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // Another 16 requests with a completely different spoofed IP
    // Due to safe fallback, they share the global limit and should also be blocked immediately
    // or if the test ran separately, after 15 requests.
    const status = await runRequests({ "x-forwarded-for": "10.0.0.1" }, 16);
    expect(status).toBe(429);
  });
});
