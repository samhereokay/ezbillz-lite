import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../src/proxy";
import { vi } from "vitest";

describe("Proxy Rate Limiter Security", () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  const runRequests = async (headers: Record<string, string>, count: number) => {
    let lastStatus = 200;
    for (let i = 0; i < count; i++) {
      const req = new NextRequest(new URL("http://localhost/api/auth/test"), {
        headers,
      });
      const res = proxy(req);
      if (res.status === 429) {
        lastStatus = 429;
      }
    }
    return lastStatus;
  };

  test("Case 1 - proxy sets security headers", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("NODE_ENV", "production");
    const req = new NextRequest(new URL("http://localhost/test"), {
        headers: { "x-real-ip": "1.2.3.4" }
    });
    const res = proxy(req);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
  });

  test("Case 2 - spoofed forwarded header cannot bypass rate limiting in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // Send 16 requests with X-Forwarded-For: 127.0.0.1 (which shouldn't bypass as isLocal in prod)
    const status = await runRequests({ "x-forwarded-for": "127.0.0.1" }, 16);
    expect(status).toBe(429);
  });

  test("Case 3 - spoofed X-Real-IP cannot bypass rate limiting in production", async () => {
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

