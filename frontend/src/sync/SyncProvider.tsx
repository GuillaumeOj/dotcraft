/** Runs cloud sync in the background while a user is signed in — no user action
 *  needed. A sync is triggered on sign-in, shortly after any local change, when
 *  the tab regains focus or the network comes back, and periodically. Network
 *  failures back off exponentially. Remote changes are broadcast to
 *  {@link useRemoteChanges} subscribers (the editor refreshes its library). */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { onLocalChange, wipeLocalLibrary } from "../qr/storage";
import {
  adoptAccount,
  hasPendingChanges,
  type RemoteChanges,
  syncOnce,
} from "./engine";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

/** Debounce between a local edit and its push. */
export const PUSH_DELAY_MS = 2000;
/** Background pull interval while signed in. */
export const POLL_INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 60_000;

export interface Sync {
  status: SyncStatus;
  lastSyncedAt: number | null;
  /** Sync right away (resolves once done; never rejects). */
  syncNow(): Promise<void>;
  /** Sign out and erase this device's copy of the library. Unless `force`, it
   *  first pushes pending changes and resolves to false — without signing out —
   *  when some could not be pushed. */
  signOut(options?: { force?: boolean }): Promise<boolean>;
  /** Be told about changes pulled from the cloud; returns the unsubscribe. */
  subscribe(listener: RemoteChangesListener): () => void;
}

export type RemoteChangesListener = (changes: RemoteChanges) => void;

export const SyncContext = createContext<Sync | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, endSession } = useAuth();
  const { i18n } = useTranslation();
  const userId = user?.id ?? null;

  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [listeners] = useState(() => new Set<RemoteChangesListener>());

  // Mutable scheduler state, shared by the callbacks below.
  const running = useRef<Promise<void> | null>(null);
  const rerun = useRef(false);
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeUser = useRef<string | null>(null);
  const adopted = useRef<string | null>(null);

  const broadcast = useCallback(
    (changes: RemoteChanges) => {
      if (changes.settings?.locale)
        void i18n.changeLanguage(changes.settings.locale);
      if (changes.library || changes.documentIds.length || changes.settings)
        for (const listener of listeners) listener(changes);
    },
    [i18n, listeners],
  );

  const run = useCallback((): Promise<void> => {
    if (running.current) {
      rerun.current = true;
      return running.current;
    }
    clearTimeout(timer.current);
    const uid = activeUser.current;
    if (!uid) return Promise.resolve();
    running.current = (async () => {
      setStatus("syncing");
      try {
        if (adopted.current !== uid) {
          broadcast(await adoptAccount(uid));
          adopted.current = uid;
        }
        broadcast(await syncOnce());
        failures.current = 0;
        setStatus("idle");
        setLastSyncedAt(Date.now());
      } catch (err) {
        failures.current += 1;
        const offline = err instanceof ApiError && err.status === 0;
        setStatus(offline ? "offline" : "error");
        const delay = Math.min(
          MAX_BACKOFF_MS,
          2 ** (failures.current - 1) * PUSH_DELAY_MS,
        );
        timer.current = setTimeout(() => void run(), delay);
      } finally {
        running.current = null;
      }
      if (rerun.current && activeUser.current) {
        rerun.current = false;
        await run();
      }
    })();
    return running.current;
  }, [broadcast]);

  // Start syncing on sign-in; stop on sign-out.
  useEffect(() => {
    activeUser.current = userId;
    if (!userId) {
      clearTimeout(timer.current);
      setStatus("idle");
      return;
    }
    void run();
    const schedule = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void run(), PUSH_DELAY_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    const onOnline = () => void run();
    const unsubscribe = onLocalChange(schedule);
    const interval = setInterval(() => void run(), POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      unsubscribe();
      clearInterval(interval);
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [userId, run]);

  const signOut = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      await run();
      if (!force && (await hasPendingChanges())) return false;
      activeUser.current = null;
      clearTimeout(timer.current);
      await running.current;
      try {
        await endSession();
      } catch {
        // Offline: the local session is cleared anyway; the cookie expires.
      }
      adopted.current = null;
      await wipeLocalLibrary();
      broadcast({ library: true, documentIds: [], settings: null });
      return true;
    },
    [run, endSession, broadcast],
  );

  const subscribe = useCallback(
    (listener: RemoteChangesListener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    [listeners],
  );

  const value = useMemo<Sync>(
    () => ({ status, lastSyncedAt, syncNow: run, signOut, subscribe }),
    [status, lastSyncedAt, run, signOut, subscribe],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/** The sync context. Must be used under {@link SyncProvider}. */
export function useSync(): Sync {
  const sync = useContext(SyncContext);
  if (!sync) throw new Error("useSync must be used within a SyncProvider");
  return sync;
}

/** Call `listener` whenever changes from the cloud were applied locally. */
export function useRemoteChanges(listener: RemoteChangesListener): void {
  const { subscribe } = useSync();
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => subscribe((changes) => latest.current(changes)), [subscribe]);
}
