# EZBILLZ Lite

Indian billing/GST/inventory SaaS foundation. Stack: Next.js 14 (App Router) +
TypeScript + Tailwind + Prisma + PostgreSQL. Free-first: runs entirely on
Docker + Postgres + local disk, no paid services required. MinIO is included
for a free S3-compatible option; Google Drive is available as an optional
per-organization "bring your own cloud" destination.

## What's implemented and verified in this build

- **Data model** (`prisma/schema.prisma`) — full multi-tenant schema: orgs,
  memberships/roles, customers, suppliers, products, invoices + items,
  purchases + items, an append-only stock ledger, payments, storage
  metadata, OAuth storage connections, audit log.
- **GST engine** (`src/lib/gst/engine.ts`) — pure functions, backend
  authoritative, integer-paise math to avoid float drift. **Verified**: run
  `npx tsx tests/gst.smoke.ts` — 20/20 assertions pass, including both
  mandatory cases (WB→WB intra-state CGST+SGST, WB→Maharashtra inter-state
  IGST), discounts, tax-inclusive pricing, and rounding. A vitest-format
  version of the same suite is in `tests/gst.test.ts`.
- **Invoice creation service** (`src/server/invoiceService.ts`) — atomic
  transaction: claims an invoice sequence number, creates the invoice +
  items, issues stock movements, writes an audit log entry. Idempotency key
  is a unique DB column so a retried request replays the original invoice
  instead of duplicating it.
- **Tenant isolation** (`src/server/tenant.ts`) — every API route resolves
  the organization from the authenticated session + membership table, never
  from a client-supplied ID. A user with no membership row gets 403
  regardless of what org ID they pass.
- **Auth** — NextAuth credentials provider, Argon2id password hashing,
  timing-equalized login response to resist user enumeration.
- **Storage abstraction** (`src/lib/storage/`) — `StorageProvider` interface
  with `LocalStorageProvider` (default, zero-config) and `S3StorageProvider`
  (works against AWS S3 or MinIO via env vars). `GoogleDriveProvider` is a
  per-organization adapter for user-connected Drive storage, with OAuth
  tokens encrypted at rest (`src/lib/crypto.ts`, AES-256-GCM) — no plaintext
  secrets in the DB, nothing sent to the browser.
- **PDF generation** (`src/lib/documents/invoicePdf.ts`) — uses `pdf-lib`
  (mature library, not a custom PDF engine), renders real persisted invoice
  data, stores the result through the storage abstraction.
- **API routes**: signup (creates user + org + OWNER membership), invoices
  (create/list), customers (create/list), products (create/list, with stock
  computed live from the movement ledger), invoice PDF download.
- **Security baseline**: `src/middleware.ts` sets standard security headers;
  every mutating route validates input with `zod`; errors never leak stack
  traces to the client.

## What is NOT yet done — be clear-eyed about this

This is a strong foundation for the golden path (signup → business setup →
customer/product → invoice → GST → PDF → stock), not a finished product:

- **Not run against a real database.** This sandbox has no network access,
  so `npm install`, `prisma migrate`, and an actual Postgres/MinIO instance
  could not be exercised here. The GST engine (the highest-risk pure logic)
  was verified directly; the Prisma/API layer has not been.
- Purchases, payments/outstanding, reports, RBAC-permission enforcement on
  every route, rate limiting, CSRF handling for non-JSON requests, import/
  export, and backup tooling are modeled in the schema but only partially or
  not yet wired into API routes/UI.
- The UI is minimal (one real invoice-entry form) — no dashboard, no
  customer/product management screens, no reports UI yet.
- No automated cross-tenant / IDOR integration tests yet (the isolation
  *mechanism* — `requireOrgContext` — is implemented and used everywhere,
  but isn't yet exercised by a test suite against a live DB).

## Run it locally

```bash
cp .env.example .env
# fill in REDACTED_SECRET and ENCRYPTION_KEY:
#   openssl rand -base64 32   (run twice, once per secret)

docker compose up -d postgres minio
npm install
npx prisma migrate dev --name init
npm run dev
```

Then sign up via `POST /api/auth/signup`, note the returned
`organizationId`, and use it to create a customer, a product, and an
invoice via the API (or the `/invoices/new` UI page, wired for a hardcoded
org/customer id — replace with real session data once the dashboard shell
exists).

## Next slices, in priority order

1. Purchases + supplier outstanding (mirrors invoice service pattern)
2. Payments + receivable/payable rollups
3. Dashboard shell + customer/product management screens
4. Reports (sales, GST, HSN/SAC, stock)
5. RBAC enforcement middleware per route, rate limiting on auth endpoints
6. Cross-tenant integration test suite against a real Postgres instance
