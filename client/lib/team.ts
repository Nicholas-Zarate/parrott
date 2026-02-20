/**
 * @deprecated Data access moved to Server Actions. Use @/actions/settings/team instead.
 * Client-side helpers for the Team / Roles page.
 */

import { createClient } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/hooks/use-permissions";

export type TeamMember = {
  userId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  email: string | null;
  discordId: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  role: AppRole | null;
};

/**
 * Fetch all users who have logged in, joined with their app role (if any).
 */
export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const supabase = createClient();

  const [profilesRes, rolesRes] = await Promise.all([
    supabase.from("parrott_user_profiles").select("*"),
    supabase.from("parrott_app_roles").select("user_id, role"),
  ]);

  if (profilesRes.error) throw new Error(profilesRes.error.message);

  const roleMap = new Map<string, AppRole>();
  for (const row of rolesRes.data ?? []) {
    roleMap.set(row.user_id, row.role as AppRole);
  }

  return (profilesRes.data ?? []).map((p) => ({
    userId: p.user_id,
    displayName: p.display_name ?? null,
    username: p.username ?? null,
    avatarUrl: p.avatar_url ?? null,
    email: p.email ?? null,
    discordId: p.discord_id ?? null,
    lastSignInAt: p.last_sign_in_at ?? null,
    createdAt: p.created_at,
    role: roleMap.get(p.user_id) ?? null,
  }));
}

/**
 * Fetch the set of Discord IDs that are bootstrap admins (Owner).
 */
export async function fetchAdminDiscordIds(): Promise<Set<string>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("parrott_admin_discord_ids")
    .select("discord_id");
  return new Set((data ?? []).map((r) => r.discord_id));
}

/**
 * Assign a role to a user. If role is null, remove their role.
 */
export async function setMemberRole(
  userId: string,
  role: AppRole | null,
  grantedBy: string
): Promise<{ error: string | null }> {
  const supabase = createClient();

  if (role === null) {
    const { error } = await supabase
      .from("parrott_app_roles")
      .delete()
      .eq("user_id", userId);
    return { error: error?.message ?? null };
  }

  // Upsert: insert or update the role
  const { error } = await supabase.from("parrott_app_roles").upsert(
    {
      user_id: userId,
      role,
      granted_by: grantedBy,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  return { error: error?.message ?? null };
}
