/** App-wide authentication state. On boot it silently restores the session from
 *  the refresh cookie; afterwards it follows every session change broadcast by
 *  the API client (sign-in, refresh, expiry, sign-out). */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as authApi from "../api/auth";
import {
  ApiError,
  type ApiUser,
  onSessionChange,
  refreshSession,
} from "../api/client";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

export interface Auth {
  status: AuthStatus;
  user: ApiUser | null;
  login(email: string, password: string): Promise<unknown>;
  register(email: string, password: string): Promise<unknown>;
  /** End the session on the server and locally (no local data is touched). */
  endSession(): Promise<void>;
  updateEmail(email: string, currentPassword: string): Promise<void>;
  changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<unknown>;
  requestPasswordReset(email: string): Promise<void>;
  confirmPasswordReset(
    uid: string,
    token: string,
    newPassword: string,
  ): Promise<void>;
}

export const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined while the session is being restored; null when signed out.
  const [user, setUser] = useState<ApiUser | null | undefined>(undefined);
  const status: AuthStatus =
    user === undefined ? "loading" : user ? "authenticated" : "anonymous";

  useEffect(
    () => onSessionChange((session) => setUser(session?.user ?? null)),
    [],
  );

  // Restore the session from the refresh cookie. When the API is unreachable
  // (offline), stay signed out for now and try again once back online.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        await refreshSession();
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        if (!cancelled) setUser((u) => (u === undefined ? null : u));
        window.addEventListener("online", restore, { once: true });
      }
    };
    void restore();
    return () => {
      cancelled = true;
      window.removeEventListener("online", restore);
    };
  }, []);

  const updateEmail = useCallback(
    async (email: string, currentPassword: string) => {
      setUser(await authApi.updateEmail(email, currentPassword));
    },
    [],
  );

  const value = useMemo<Auth>(
    () => ({
      status,
      user: user ?? null,
      login: authApi.login,
      register: authApi.register,
      endSession: authApi.logout,
      updateEmail,
      changePassword: authApi.changePassword,
      requestPasswordReset: authApi.requestPasswordReset,
      confirmPasswordReset: authApi.confirmPasswordReset,
    }),
    [status, user, updateEmail],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** The authentication context. Must be used under {@link AuthProvider}. */
export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used within an AuthProvider");
  return auth;
}
