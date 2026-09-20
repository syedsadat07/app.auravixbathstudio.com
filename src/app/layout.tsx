import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import { NavProvider } from "@/lib/nav";

export const metadata: Metadata = {
  title: "AURAVIX BATH STUDIO — Quotation & Lead Management",
  description:
    "Internal CRM + bathroom renovation quotation platform for AURAVIX BATH STUDIO. Manage leads, customers, materials and generate professional quotations.",
  applicationName: "AURAVIX Bath Studio",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/brand/icon.png",
    apple: "/brand/icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#26262b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-background text-foreground">
        <AuthProvider>
          <NavProvider>{children}</NavProvider>
        </AuthProvider>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
