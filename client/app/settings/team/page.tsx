"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Shield, ShieldCheck, Pencil, Eye, X, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions, type AppRole } from "@/lib/hooks/use-permissions";
import { fetchTeamMembers, setMemberRole, fetchAdminDiscordIds, type TeamMember } from "@/lib/team";

export const dynamic = "force-dynamic";

const ROLE_OPTIONS: { value: AppRole | "none"; label: string; icon: React.ReactNode }[] = [
  { value: "admin", label: "Admin", icon: <ShieldCheck className="size-3.5" /> },
  { value: "editor", label: "Editor", icon: <Pencil className="size-3.5" /> },
  { value: "viewer", label: "Viewer", icon: <Eye className="size-3.5" /> },
  { value: "none", label: "No role", icon: <X className="size-3.5" /> },
];

function roleBadge(role: AppRole | null, isBootstrapAdmin: boolean) {
  if (isBootstrapAdmin) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600 dark:text-amber-400">
        <Shield className="size-3" aria-hidden />
        Owner
      </Badge>
    );
  }
  if (!role) return null;
  const colors: Record<AppRole, string> = {
    admin: "border-blue-500/50 text-blue-600 dark:text-blue-400",
    editor: "border-green-500/50 text-green-600 dark:text-green-400",
    viewer: "border-muted-foreground/50 text-muted-foreground",
  };
  const icons: Record<AppRole, React.ReactNode> = {
    admin: <ShieldCheck className="size-3" aria-hidden />,
    editor: <Pencil className="size-3" aria-hidden />,
    viewer: <Eye className="size-3" aria-hidden />,
  };
  return (
    <Badge variant="outline" className={`gap-1 ${colors[role]}`}>
      {icons[role]}
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </Badge>
  );
}

type TeamState =
  | { status: "loading" }
  | { status: "success"; members: TeamMember[]; adminDiscordIds: Set<string> }
  | { status: "error"; error: string };

export default function TeamPage() {
  const perms = usePermissions();
  const [state, setState] = useState<TeamState>({ status: "loading" });
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: "loading" });
    Promise.all([fetchTeamMembers(), fetchAdminDiscordIds()])
      .then(([members, adminDiscordIds]) =>
        setState({ status: "success", members, adminDiscordIds })
      )
      .catch((err) =>
        setState({
          status: "error",
          error: err instanceof Error ? err.message : "Failed to load team",
        })
      );
  }, []);

  useEffect(() => {
    if (!perms.loading) load();
  }, [perms.loading, load]);

  async function handleRoleChange(member: TeamMember, newRole: AppRole | "none") {
    if (!perms.userId) return;
    setBusyUserId(member.userId);
    const { error } = await setMemberRole(
      member.userId,
      newRole === "none" ? null : newRole,
      perms.userId
    );
    setBusyUserId(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Updated ${member.displayName ?? member.username ?? "user"}`);
    load();
  }

  if (perms.loading) {
    return (
      <div className="p-8 max-w-3xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!perms.authenticated) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-semibold text-foreground">Team</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need to log in with Discord to view this page.
        </p>
      </div>
    );
  }

  if (!perms.isAdmin) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-semibold text-foreground">Team</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only admins can manage team roles.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3">
        <Users className="size-6 text-muted-foreground" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Team</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage roles for users who have logged in with Discord.
          </p>
        </div>
      </div>

      <div className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          <strong>Admin</strong> — full access, can manage roles and settings.{" "}
          <strong>Editor</strong> — can edit activity settings.{" "}
          <strong>Viewer</strong> — read-only access.{" "}
          <strong>Owner</strong> — bootstrap admin (your Discord ID in the
          allowlist).
        </p>
      </div>

      {state.status === "loading" && (
        <p className="mt-6 text-sm text-muted-foreground">Loading team...</p>
      )}

      {state.status === "error" && (
        <div className="mt-6 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-4">
          <p className="text-sm font-medium text-destructive">{state.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {state.status === "success" && (
        <ul className="mt-6 flex flex-col gap-3" role="list">
          {state.members.map((member) => {
            const name = member.displayName || member.username || "Unknown";
            const isSelf = member.userId === perms.userId;
            const memberIsBootstrapAdmin =
              !!member.discordId &&
              state.adminDiscordIds.has(member.discordId);

            return (
              <li key={member.userId}>
                <Card>
                  <CardContent className="flex items-center gap-3 py-3">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt=""
                        className="size-9 shrink-0 rounded-full"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                        {name.charAt(0).toUpperCase()}
                      </span>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {name}
                        </span>
                        {isSelf && (
                          <span className="text-[10px] text-muted-foreground">(you)</span>
                        )}
                      </div>
                      {member.username && member.username !== member.displayName && (
                        <p className="truncate text-xs text-muted-foreground">
                          @{member.username}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {roleBadge(member.role, memberIsBootstrapAdmin)}

                      {!memberIsBootstrapAdmin && (
                        <Select
                          value={member.role ?? "none"}
                          onValueChange={(v) =>
                            handleRoleChange(member, v as AppRole | "none")
                          }
                          disabled={busyUserId === member.userId}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-[120px] text-xs"
                            aria-label={`Change role for ${name}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <span className="flex items-center gap-1.5">
                                  {opt.icon}
                                  {opt.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
          {state.members.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No users have logged in yet.
            </p>
          )}
        </ul>
      )}
    </div>
  );
}
