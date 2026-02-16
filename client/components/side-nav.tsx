"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import {
  Home,
  History,
  Menu,
  PanelLeftClose,
  PanelLeft,
  Terminal,
  Activity,
  ChevronDown,
  ChevronRight,
  Settings,
  Users,
  User,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AuthUser } from "@/components/auth-user";
import { usePermissions } from "@/lib/hooks/use-permissions";

const activitiesChildren = [
  { href: "/activities", label: "Feed" },
  { href: "/activities/scenarios", label: "Scenarios" },
] as const;

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/history", label: "History", icon: History },
  { href: "/personality", label: "Personality", icon: Sparkles },
  { href: "/activities", label: "Activities", icon: Activity, children: activitiesChildren },
  { href: "/logs", label: "Logs", icon: Terminal },
] as const;

type NavItem = (typeof navItems)[number];

function isActivitiesGroup(item: NavItem): item is NavItem & { children: typeof activitiesChildren } {
  return "children" in item && Array.isArray(item.children);
}

const settingsChildren = [
  { href: "/settings/team", label: "Team", icon: Users },
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
  const perms = usePermissions();
  const activitiesOpen = pathname.startsWith("/activities");
  const settingsOpen = pathname.startsWith("/settings");
  const [activitiesExpanded, setActivitiesExpanded] = useState(activitiesOpen);
  const [settingsExpanded, setSettingsExpanded] = useState(settingsOpen);

  useEffect(() => {
    if (activitiesOpen) setActivitiesExpanded(true);
  }, [activitiesOpen]);

  useEffect(() => {
    if (settingsOpen) setSettingsExpanded(true);
  }, [settingsOpen]);

  return (
    <ul className="flex flex-col gap-1">
      {navItems.map((item) => {
        if (isActivitiesGroup(item)) {
          const { href, label, icon: Icon, children } = item;
          const isParentActive = pathname.startsWith(href);
          if (collapsed) {
            return (
              <li key={href}>
                <Link
                  href={children[0].href}
                  onClick={onNavigate}
                  title="Activities"
                  className={cn(
                    "flex items-center rounded-md text-sm font-medium transition-colors",
                    "justify-center px-2 py-2",
                    isParentActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                </Link>
              </li>
            );
          }
          return (
            <li key={href} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setActivitiesExpanded((e) => !e)}
                className={cn(
                  "flex items-center rounded-md text-sm font-medium transition-colors w-full",
                  "gap-3 px-3 py-2",
                  isParentActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                aria-expanded={activitiesExpanded}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 text-left">{label}</span>
                {activitiesExpanded ? (
                  <ChevronDown className="size-4 shrink-0" aria-hidden />
                ) : (
                  <ChevronRight className="size-4 shrink-0" aria-hidden />
                )}
              </button>
              {activitiesExpanded ? (
                <ul className="flex flex-col gap-0.5 pl-4 border-l border-sidebar-border ml-2">
                  {children.map((sub) => {
                    const isSubActive =
                      sub.href === "/activities"
                        ? pathname === "/activities"
                        : pathname.startsWith(sub.href);
                    return (
                      <li key={sub.href}>
                        <Link
                          href={sub.href}
                          onClick={onNavigate}
                          className={cn(
                            "flex items-center rounded-md text-sm font-medium transition-colors py-1.5 pr-2 pl-2 -ml-px border-l-2",
                            isSubActive
                              ? "border-sidebar-accent-foreground bg-sidebar-accent/50 text-sidebar-accent-foreground"
                              : "border-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                          )}
                        >
                          {sub.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        }
        const { href, label, icon: Icon } = item;
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

      {/* Authenticated users: User (preferences) */}
      {perms.authenticated && (
        <>
          {!collapsed && (
            <div className="my-2 mx-2 border-t border-sidebar-border" />
          )}
          <li>
            <Link
              href="/user"
              onClick={onNavigate}
              title="User"
              className={cn(
                "flex items-center rounded-md text-sm font-medium transition-colors",
                collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                pathname.startsWith("/user")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <User className="size-4 shrink-0" aria-hidden />
              {!collapsed && <span>User</span>}
            </Link>
          </li>
        </>
      )}

      {/* Admin-only: Settings section */}
      {perms.isAdmin && (
        <>
          {!collapsed && (
            <div className="my-2 mx-2 border-t border-sidebar-border" />
          )}
          {collapsed ? (
            <li>
              <Link
                href="/settings/team"
                onClick={onNavigate}
                title="Team"
                className={cn(
                  "flex items-center rounded-md text-sm font-medium transition-colors",
                  "justify-center px-2 py-2",
                  settingsOpen
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Settings className="size-4 shrink-0" aria-hidden />
              </Link>
            </li>
          ) : (
            <li className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setSettingsExpanded((e) => !e)}
                className={cn(
                  "flex items-center rounded-md text-sm font-medium transition-colors w-full",
                  "gap-3 px-3 py-2",
                  settingsOpen
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                aria-expanded={settingsExpanded}
              >
                <Settings className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 text-left">Settings</span>
                {settingsExpanded ? (
                  <ChevronDown className="size-4 shrink-0" aria-hidden />
                ) : (
                  <ChevronRight className="size-4 shrink-0" aria-hidden />
                )}
              </button>
              {settingsExpanded ? (
                <ul className="flex flex-col gap-0.5 pl-4 border-l border-sidebar-border ml-2">
                  {settingsChildren.map((sub) => {
                    const isSubActive = pathname.startsWith(sub.href);
                    const SubIcon = sub.icon;
                    return (
                      <li key={sub.href}>
                        <Link
                          href={sub.href}
                          onClick={onNavigate}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md text-sm font-medium transition-colors py-1.5 pr-2 pl-2 -ml-px border-l-2",
                            isSubActive
                              ? "border-sidebar-accent-foreground bg-sidebar-accent/50 text-sidebar-accent-foreground"
                              : "border-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                          )}
                        >
                          <SubIcon className="size-3.5 shrink-0" aria-hidden />
                          {sub.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          )}
        </>
      )}
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
        "hidden md:flex md:h-full md:min-h-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out",
        collapsed ? "w-14" : "w-56"
      )}
      aria-label="Main navigation"
    >
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        <NavLinks collapsed={collapsed} />
      </div>
      <div className="shrink-0 border-t border-sidebar-border p-2 flex flex-col gap-1">
        <AuthUser collapsed={collapsed} />
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
    <div className="sticky top-0 z-40 shrink-0 flex md:hidden items-center border-b border-sidebar-border bg-sidebar px-3 py-2">
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
          className="flex w-56 flex-col bg-sidebar p-0"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 flex items-center border-b border-sidebar-border px-4 py-3">
              <span className="text-sm font-semibold text-sidebar-foreground">
                Parrott
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <NavLinks onNavigate={close} />
            </div>
            <div className="shrink-0 border-t border-sidebar-border p-2">
              <AuthUser />
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
