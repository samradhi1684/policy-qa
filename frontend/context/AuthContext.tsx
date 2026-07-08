"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const API_URL =
  (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/+$/, "");

type User = {
  id: string;
  email: string;
  username: string;
  display_name?: string | null;
  role?: string | null;
  country?: string | null;
  onboarding_completed?: boolean;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  /** True once the initial localStorage token check has completed. */
  ready: boolean;
  /** True when there is no authenticated session (guest mode). */
  isGuest: boolean;
  login: (token: string) => Promise<User>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Removes every trace of the previous session from browser storage.
 * Centralised so logout and invalid-token handling behave identically.
 */
function purgeSessionStorage() {
  try {
    localStorage.removeItem("token");
    // Defensive: clear anything else the app may have cached per-session.
    sessionStorage.clear();
  } catch {
    /* storage unavailable (SSR / privacy mode) — nothing to purge */
  }
}

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const fetchUser = useCallback(
    async (tok: string): Promise<User> => {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${tok}` },
      });

      if (!response.ok) {
        // Token is stale/invalid — treat as logged out rather than
        // keeping a half-authenticated state around.
        purgeSessionStorage();
        setToken(null);
        setUser(null);
        throw new Error("Session expired");
      }

      const data = await response.json();
      setUser(data);
      return data;
    },
    []
  );

  useEffect(() => {
    const saved = localStorage.getItem("token");

    if (saved) {
      setToken(saved);
      fetchUser(saved)
        .catch(() => {})
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }

    // Keep auth state in sync across tabs: logging out in one tab
    // immediately logs out every other tab.
    function onStorage(e: StorageEvent) {
      if (e.key === "token" && e.newValue === null) {
        setToken(null);
        setUser(null);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [fetchUser]);

  async function login(tok: string): Promise<User> {
    localStorage.setItem("token", tok);
    setToken(tok);
    return await fetchUser(tok);
  }

  function logout() {
    purgeSessionStorage();
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        ready,
        isGuest: ready && !token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("AuthProvider missing");
  }
  return context;
}
