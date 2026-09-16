import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth/options";
import { prisma } from "../lib/db/client";

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

/**
 * Resolves the authenticated user + their membership in the requested
 * organization directly from the server session — never from a request
 * body/header/query param. Every API route that touches tenant data must
 * call this first and use the returned `organizationId` for every query.
 *
 * This is the single choke point that prevents IDOR / cross-tenant access:
 * if there's no active membership row, the request is rejected before any
 * business logic runs.
 */
export async function requireOrgContext(requestedOrgId?: string | null) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    throw new UnauthorizedError("Not authenticated");
  }

  let orgId = requestedOrgId;

  if (!orgId) {
    const firstMembership = await prisma.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    if (!firstMembership) {
      throw new ForbiddenError("User is not a member of any organization");
    }
    orgId = firstMembership.organizationId;
  }

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: orgId,
      },
    },
  });

  if (!membership) {
    // Deliberately identical error/shape whether the org doesn't exist or
    // the user just isn't a member of it — don't leak org existence.
    throw new ForbiddenError("Not a member of this organization");
  }

  return {
    userId,
    organizationId: orgId,
    role: membership.role,
  };
}

export function requireRole(
  role: "OWNER" | "ADMIN" | "MANAGER" | "STAFF",
  allowed: Array<"OWNER" | "ADMIN" | "MANAGER" | "STAFF">
) {
  if (!allowed.includes(role)) {
    throw new ForbiddenError(`Role ${role} is not permitted to perform this action`);
  }
}
