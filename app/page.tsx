import type { Metadata } from "next";
import { headers } from "next/headers";
import { ApplicationShell } from "../components/application-shell";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") === "http" ? "http" : "https";
  const socialImage = `${protocol}://${host}/og.png`;

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
