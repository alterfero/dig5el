import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
