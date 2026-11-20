"use server";

import { createClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "editor" | "viewer";

export type PermissionsData = {
  userId: string;
  appRole: AppRole | null;
  isBootstrapAdmin: boolean;
  canEdit: boolean;
  isAdmin: boolean;
};

export type GetPermissionsResult =
  | { data: PermissionsData; error: null }
  | { data: null; error: string };

/**
 * Server Action: resolve current user's permissions (role + check_permissions RPC).
 */
export async function getPermissions(): Promise<GetPermissionsResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) return { data: null, error: authError.message };
  if (!user) {
    return { data: null, error: "Not signed in." };
  }

  const [roleResult, permsResult] = await Promise.all([
    supabase.from("parrott_app_roles").select("role").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("check_permissions"),
  ]);

  const appRole = (roleResult.data?.role as AppRole) ?? null;
  const permsData = permsResult.data as { is_admin: boolean; can_edit: boolean } | null;
  const isBootstrapAdmin = permsData?.is_admin === true;
  const canEdit = permsData?.can_edit === true;
  const isAdmin = isBootstrapAdmin || appRole === "admin";

  return {
    data: {
      userId: user.id,
      appRole,
      isBootstrapAdmin,
      canEdit,
      isAdmin,
    },
    error: null,
  };
}
