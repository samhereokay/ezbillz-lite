import { test, expect, vi } from "vitest";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";

test("proxy adds X-Request-ID if missing", () => {
  const req = new NextRequest("http://localhost:3000/api/health");
  const res = proxy(req);
  expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-fA-F-]+$/);
});

test("proxy handles existing valid X-Request-ID in dev", () => {
  const spoofedId = crypto.randomUUID();
  const req = new NextRequest("http://localhost:3000/api/health", {
    headers: { "x-request-id": spoofedId }
  });
  
  vi.stubEnv("NODE_ENV", "development");
  
  const res = proxy(req);
  expect(res.headers.get("x-request-id")).toBe(spoofedId);
  
  vi.unstubAllEnvs();
});
