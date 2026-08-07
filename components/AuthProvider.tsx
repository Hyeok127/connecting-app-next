"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: () => {},
  logout: async () => {},
  refresh: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: User }>("/me");
      setUser(data.user);
      return data.user;
    } catch {
      setToken(null);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      Promise.resolve().then(() => {
        if (!cancelled) setLoading(false);
      });
    } else {
      api<{ user: User }>("/me")
        .then((d) => {
          if (cancelled) return;
          setUser(d.user);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setToken(null);
          setUser(null);
          setLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((token: string, u: User) => {
    setToken(token);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
