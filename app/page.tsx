import type { Metadata } from "next";
import { headers } from "next/headers";
import { ApplicationShell } from "../components/application-shell";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const trustedOrigin = requestHeaders.get("x-dig4el-app-origin");
  let socialImage = "/og.png";

  if (trustedOrigin) {
    try {
      const origin = new URL(trustedOrigin);
      if (origin.protocol === "https:") {
        socialImage = new URL("/og.png", origin).toString();
      }
    } catch {
      // The Worker does not supply malformed values. Keep a safe local fallback.
    }
  }

  return {
    title: "DIG4EL — language documentation, made welcoming",
    description:
      "A calm, guided workspace for documenting language together in everyday words.",
    openGraph: {
      title: "DIG4EL — language documentation, made welcoming",
      description:
        "A calm, guided workspace for documenting language together in everyday words.",
      images: [{ url: socialImage, width: 1730, height: 909, alt: "DIG4EL" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "DIG4EL — language documentation, made welcoming",
      description:
        "A calm, guided workspace for documenting language together in everyday words.",
      images: [socialImage],
    },
  };
}

export default function Home() {
  return <ApplicationShell />;
}
