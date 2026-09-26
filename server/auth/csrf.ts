import { createHmac, timingSafeEqual } from "node:crypto";

export class CsrfProtectionError extends Error {
  constructor(readonly code: "CSRF_ORIGIN_REJECTED" | "CSRF_TOKEN_REJECTED") {
    super("We could not confirm that request came from DIG4EL. Please try again.");
    this.name = "CsrfProtectionError";
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

/** A token is bound to a server-only session secret and opaque cookie value. */
export function createCsrfToken(sessionId: string, secret: Buffer): string {
  return createHmac("sha256", secret)
    .update("dig4el.auth.csrf.v1\0", "utf8")
    .update(sessionId, "utf8")
    .digest("base64url");
}

export function assertSameOrigin(request: Request, appOrigin: URL): void {
  const origin = request.headers.get("origin");
  if (!origin || !safeEqual(origin, appOrigin.origin)) {
    throw new CsrfProtectionError("CSRF_ORIGIN_REJECTED");
  }
}

/**
 * Authenticate unsafe browser requests with both a strict Origin comparison
 * and a token that is unavailable to cross-origin pages.
 */
export function assertAuthenticatedCsrf(
  request: Request,
  appOrigin: URL,
  sessionId: string,
  secret: Buffer,
): void {
  assertSameOrigin(request, appOrigin);
  const provided = request.headers.get("x-dig4el-csrf");
  const expected = createCsrfToken(sessionId, secret);
  if (!provided || !safeEqual(provided, expected)) {
    throw new CsrfProtectionError("CSRF_TOKEN_REJECTED");
  }
}
