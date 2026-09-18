import type { ReactNode } from "react";
import { vi } from "vitest";
import { type Auth, AuthContext } from "../auth/AuthProvider";
import type { RemoteChanges } from "../sync/engine";
import {
  type RemoteChangesListener,
  type Sync,
  SyncContext,
} from "../sync/SyncProvider";

/** A signed-out auth context whose actions are spies (override as needed). */
export function fakeAuth(over: Partial<Auth> = {}): Auth {
  return {
    status: "anonymous",
    user: null,
    login: vi.fn(async () => {}),
    register: vi.fn(async () => {}),
    endSession: vi.fn(async () => {}),
    updateEmail: vi.fn(async () => {}),
    changePassword: vi.fn(async () => {}),
    requestPasswordReset: vi.fn(async () => {}),
    confirmPasswordReset: vi.fn(async () => {}),
    ...over,
  };
}

/** An idle sync context whose actions are spies (override as needed). Call
 *  `emit` to simulate changes pulled from the cloud. */
export function fakeSync(
  over: Partial<Sync> = {},
): Sync & { emit(changes: RemoteChanges): void } {
  const listeners = new Set<RemoteChangesListener>();
  return {
    status: "idle",
    lastSyncedAt: null,
    syncNow: vi.fn(async () => {}),
    signOut: vi.fn(async () => true),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: (changes) => {
      for (const listener of listeners) listener(changes);
    },
    ...over,
  };
}

/** Provide fixed auth and sync contexts, so components using `useAuth` /
 *  `useSync` render without the real providers (and their network calls). */
export function TestProviders({
  auth = fakeAuth(),
  sync = fakeSync(),
  children,
}: {
  auth?: Auth;
  sync?: Sync;
  children: ReactNode;
}) {
  return (
    <AuthContext.Provider value={auth}>
      <SyncContext.Provider value={sync}>{children}</SyncContext.Provider>
    </AuthContext.Provider>
  );
}
