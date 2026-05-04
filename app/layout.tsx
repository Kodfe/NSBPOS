import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NSB POS — Supermarket Billing System",
  description: "Point of Sale system for NSB Supermarket",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased overflow-hidden"
    >
      <body className="min-h-full h-full flex flex-col overflow-hidden">{children}</body>
    </html>
  );
}
