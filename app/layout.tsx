import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "Roofnut CRM | Your Roofing Command Center",
  description: "Roofnut's sales, production, estimating and customer command center.",
  openGraph: {
    title: "Roofnut CRM",
    description: "Your roofing command center.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Roofnut CRM — Your roofing command center" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Roofnut CRM",
    description: "Your roofing command center.",
    images: ["/og.png"],
  },
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
