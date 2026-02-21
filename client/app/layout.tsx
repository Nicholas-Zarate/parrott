import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { ViewportHeightProvider } from "@/components/viewport-height-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Parrott",
  description: "Parrott client",
  icons: {
    icon: "/assets/toucan_white.png",
  },
};

/** Enables safe-area insets (notch, home indicator) on supported mobile browsers. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        <ViewportHeightProvider />
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
