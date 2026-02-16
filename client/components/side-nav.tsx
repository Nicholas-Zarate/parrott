"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback } from "react";
import { Home, History, Menu, PanelLeftClose, PanelLeft, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/history", label: "History", icon: History },
  { href: "/logs", label: "Logs", icon: Terminal },
] as const;

/**
 * Shared nav link list used by both desktop sidebar and mobile drawer.
 */
function NavLinks({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center rounded-md text-sm font-medium transition-colors",
                collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {!collapsed && <span>{label}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Desktop sidebar — collapsible between full width (w-56) and icon-only rail (w-14).
 * Hidden on mobile (< md).
 */
export function DesktopSideNav() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav
      className={cn(
        "hidden md:flex flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out",
        collapsed ? "w-14" : "w-56"
      )}
      aria-label="Main navigation"
    >
      <div className="flex-1 p-2">
        <NavLinks collapsed={collapsed} />
      </div>
      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            "h-8 w-full text-muted-foreground hover:text-foreground",
            collapsed ? "justify-center" : "justify-start gap-2 px-2"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="size-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="size-4 shrink-0" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </nav>
  );
}

/**
 * Mobile top-bar + sheet drawer. Visible only on mobile (< md).
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="flex md:hidden items-center border-b border-sidebar-border bg-sidebar px-3 py-2">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground"
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-56 bg-sidebar p-0"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">
            <div className="flex items-center border-b border-sidebar-border px-4 py-3">
              <span className="text-sm font-semibold text-sidebar-foreground">
                Parrott
              </span>
            </div>
            <div className="flex-1 p-2">
              <NavLinks onNavigate={close} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <span className="ml-2 text-sm font-semibold text-sidebar-foreground">
        Parrott
      </span>
    </div>
  );
}
