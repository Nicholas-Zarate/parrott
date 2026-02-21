"use client";

import { usePathname } from "next/navigation";
import { DesktopSideNav, MobileNav } from "@/components/side-nav";

/**
 * Renders sidebar + main area for app routes; only children for /login and /auth.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage =
    pathname === "/login" || pathname?.startsWith("/auth/");

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <>
      <MobileNav />
      <div className="root-layout flex h-dvh flex-col md:flex-row overflow-hidden">
        <DesktopSideNav />
        <main className="flex-1 min-h-0 overflow-auto bg-background pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-0">
          {children}
        </main>
      </div>
    </>
  );
}
