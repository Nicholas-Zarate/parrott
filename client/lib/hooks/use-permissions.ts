"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AppRole = "admin" | "editor" | "viewer";

export type Permissions = {
  /** True while fetching session + role */
  loading: boolean;
  /** True if there's any authenticated session */
  authenticated: boolean;
  /** The user's Supabase auth UUID, or null */
  userId: string | null;
  /** App role from parrott_app_roles, or null if none assigned */
  appRole: AppRole | null;
  /** True if the user's Discord ID is in parrott_admin_discord_ids (bootstrap admin) */
  isBootstrapAdmin: boolean;
  /** Convenience: can write settings (bootstrap admin OR admin/editor role) */
  canEdit: boolean;
  /** Convenience: is admin (bootstrap admin OR admin role) */
  isAdmin: boolean;
};

/**
 * Hook that resolves the current user's permissions.
 * Uses the server-side `check_permissions()` RPC to reliably determine
 * admin/editor status (the DB function checks auth.identities directly).
 */
export function usePermissions(): Permissions {
  const [state, setState] = useState<Permissions>({
    loading: true,
    authenticated: false,
    userId: null,
    appRole: null,
    isBootstrapAdmin: false,
    canEdit: false,
    isAdmin: false,
  });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function resolve() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;
      if (!user) {
        setState({
          loading: false,
          authenticated: false,
          userId: null,
          appRole: null,
          isBootstrapAdmin: false,
          canEdit: false,
          isAdmin: false,
        });
        return;
      }

      // Fetch app role and server-side permission check in parallel
      const [roleResult, permsResult] = await Promise.all([
        supabase
          .from("parrott_app_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.rpc("check_permissions"),
      ]);

      if (cancelled) return;

      const appRole = (roleResult.data?.role as AppRole) ?? null;
      const permsData = permsResult.data as
        | { is_admin: boolean; can_edit: boolean }
        | null;
      const isBootstrapAdmin = permsData?.is_admin === true;
      const canEdit = permsData?.can_edit === true;
      const isAdmin = isBootstrapAdmin || appRole === "admin";

      setState({
        loading: false,
        authenticated: true,
        userId: user.id,
        appRole,
        isBootstrapAdmin,
        canEdit,
        isAdmin,
      });
    }

    resolve();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      resolve();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
