import type { Metadata } from "next";
import { ApplicationShell } from "../components/application-shell";
import { metadataBaseFor } from "../server/metadata-base";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const socialImage = new URL("/og.png", metadataBaseFor()).toString();

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
