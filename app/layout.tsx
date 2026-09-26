import type { Metadata } from "next";
import { LocaleProvider } from "../components/locale-provider";
import { metadataBaseFor } from "../server/metadata-base";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: metadataBaseFor(),
  title: "DIG4EL",
  description:
    "A welcoming workspace for language documentation and community knowledge.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html dir="ltr" lang="en">
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
