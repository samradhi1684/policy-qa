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

// Keys owned by AuthContext — the only sessionStorage entries we ever nuke.
// Guest-session keys (policysense_guest_*) are intentionally NOT listed here
// so they survive token expiry and tab switches.
const AUTH_SESSION_KEYS = [
  "policysense_pending_prompt",
  "policysense_pending_country",
];

/**
 * Removes every trace of the *auth* session from browser storage.
 * Deliberately does NOT call sessionStorage.clear() so that guest-session
 * data written by the chat page survives token expiry and tab switches.
 */
function purgeAuthStorage() {
  try {
    localStorage.removeItem("token");
    for (const key of AUTH_SESSION_KEYS) {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable (SSR / privacy mode) — nothing to purge */
  }
}

/**
 * When a guest becomes authenticated we DO want to wipe their guest
 * conversation so it doesn't bleed into the real account's chat page.
 */
function purgeGuestSession() {
  try {
    sessionStorage.removeItem("policysense_guest_messages");
    sessionStorage.removeItem("policysense_guest_country");
  } catch { /* ignore */ }
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
        // NOTE: we use purgeAuthStorage (not sessionStorage.clear) so
        // any saved guest session is left intact.
        purgeAuthStorage();
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
    // Wipe any guest session when the user actually logs in so the chat
    // page starts clean under the real account.
    purgeGuestSession();
    localStorage.setItem("token", tok);
    setToken(tok);
    return await fetchUser(tok);
  }

  function logout() {
    purgeAuthStorage();
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
