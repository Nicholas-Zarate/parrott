"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPermissions, type AppRole, type PermissionsData } from "@/actions/auth/getPermissions";

export type { AppRole };

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

function toState(data: PermissionsData | null): Omit<Permissions, "loading"> {
  if (!data) {
    return {
      authenticated: false,
      userId: null,
      appRole: null,
      isBootstrapAdmin: false,
      canEdit: false,
      isAdmin: false,
    };
  }
  return {
    authenticated: true,
    userId: data.userId,
    appRole: data.appRole,
    isBootstrapAdmin: data.isBootstrapAdmin,
    canEdit: data.canEdit,
    isAdmin: data.isAdmin,
  };
}

/**
 * Hook that resolves the current user's permissions via Server Action.
 * Refetches on auth state change (client Supabase only for onAuthStateChange).
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

    async function resolve() {
      const result = await getPermissions();
      if (cancelled) return;
      setState({
        loading: false,
        ...toState(result.data),
      });
    }

    resolve();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      setState((prev) => ({ ...prev, loading: true }));
      resolve();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
