import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DesktopSideNav, MobileNav } from "@/components/side-nav";
import { Toaster } from "@/components/ui/sonner";
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
        <div className="flex h-dvh flex-col md:flex-row overflow-hidden">
          <MobileNav />
          <DesktopSideNav />
          <main className="flex-1 min-h-0 overflow-auto bg-background">
            {children}
          </main>
        </div>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
