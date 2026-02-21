"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { AppUser } from "@/lib/auth-user-types";

type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
  refetch: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const data = (await res.json()) as AppUser;
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      refetch();
    });
    return () => subscription.unsubscribe();
  }, [refetch]);

  return (
    <AuthContext.Provider value={{ user, loading, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAppUser(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAppUser must be used within AuthProvider");
  }
  return ctx;
}
