"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import type { AppRole } from "@/actions/auth/getPermissions";

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

export type FetchTeamMembersResult =
  | { data: TeamMember[]; error: null }
  | { data: null; error: string };

export async function fetchTeamMembers(): Promise<FetchTeamMembersResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { data: null, error: auth.error };
  const supabase = await createClient();
  const [profilesRes, rolesRes] = await Promise.all([
    supabase.from("parrott_user_profiles").select("*"),
    supabase.from("parrott_app_roles").select("user_id, role"),
  ]);
  if (profilesRes.error) return { data: null, error: profilesRes.error.message };
  const roleMap = new Map<string, AppRole>();
  for (const row of rolesRes.data ?? []) {
    roleMap.set(row.user_id, row.role as AppRole);
  }
  const data = (profilesRes.data ?? []).map((p) => ({
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
  return { data, error: null };
}

export type FetchAdminDiscordIdsResult =
  | { data: string[]; error: null }
  | { data: null; error: string };

export async function fetchAdminDiscordIds(): Promise<FetchAdminDiscordIdsResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { data: null, error: auth.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("parrott_admin_discord_ids").select("discord_id");
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map((r) => r.discord_id), error: null };
}

export type SetMemberRoleResult = { error: string | null };

export async function setMemberRole(
  userId: string,
  role: AppRole | null,
  grantedBy: string
): Promise<SetMemberRoleResult> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return { error: auth.error };
  const supabase = await createClient();
  if (role === null) {
    const { error } = await supabase.from("parrott_app_roles").delete().eq("user_id", userId);
    return { error: error?.message ?? null };
  }
  const { error } = await supabase.from("parrott_app_roles").upsert(
    {
      user_id: userId,
      role,
      granted_by: grantedBy,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  revalidatePath("/settings/team");
  return { error: error?.message ?? null };
}
