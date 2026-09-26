const secureSessionCookieName = "__Host-dig4el_session";
const localSessionCookieName = "dig4el_session";

export type SessionCookiePolicy = {
  now?: Date;
  secure: boolean;
};

function assertCookieValue(value: string): void {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) {
    throw new Error("Invalid session cookie value.");
  }
}

/** `__Host-` prevents a subdomain from setting a production session cookie. */
export function getSessionCookieName(secure: boolean): string {
  return secure ? secureSessionCookieName : localSessionCookieName;
}

export function parseSessionCookie(cookieHeader: string | null, secure: boolean): string | null {
  if (!cookieHeader) return null;
  const name = getSessionCookieName(secure);
  const values = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));

  if (values.length !== 1) return null;
  const [value] = values;
  return value && /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
}

export function buildSessionCookie(
  value: string,
  expiresAt: Date,
  policy: SessionCookiePolicy,
): string {
  assertCookieValue(value);
  const now = policy.now ?? new Date();
  const maxAge = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
  const attributes = [
    `${getSessionCookieName(policy.secure)}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Priority=High",
    `Max-Age=${maxAge}`,
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (policy.secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function clearSessionCookie(policy: SessionCookiePolicy): string {
  const attributes = [
    `${getSessionCookieName(policy.secure)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Priority=High",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (policy.secure) attributes.push("Secure");
  return attributes.join("; ");
}
