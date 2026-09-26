import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";
const developmentOriginPattern = /^(?:(?:\*|\*\*)\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?))*$/iu;

/**
 * Next matches hostnames only (not schemes or ports) for its development
 * asset boundary. Keeping this opt-in avoids opening HMR to every device on a
 * local network while still supporting a deliberate LAN preview.
 */
export function parseAllowedDevOrigins(value: string | undefined): string[] {
  const origins = [...new Set(
    (value ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  )];

  for (const origin of origins) {
    if (!developmentOriginPattern.test(origin)) {
      throw new Error(
        "DIG4EL_ALLOWED_DEV_ORIGINS must contain comma-separated hostnames without a scheme or port.",
      );
    }
  }

  return origins;
}

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
    ].join("; "),
  },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(isDevelopment
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: isDevelopment
    ? parseAllowedDevOrigins(process.env.DIG4EL_ALLOWED_DEV_ORIGINS)
    : undefined,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
