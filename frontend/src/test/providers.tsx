import type { ReactNode } from "react";
import { vi } from "vitest";
import { type Auth, AuthContext } from "../auth/AuthProvider";
import {
  ListenersContext,
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

/** An idle sync context whose actions are spies (override as needed). */
export function fakeSync(over: Partial<Sync> = {}): Sync {
  return {
    status: "idle",
    lastSyncedAt: null,
    syncNow: vi.fn(async () => {}),
    signOut: vi.fn(async () => true),
    ...over,
  };
}

/** Subscribers registered through `useRemoteChanges` under
 *  {@link TestProviders}: call {@link emitRemoteChanges} to notify them. */
export const remoteChangeListeners = new Set<RemoteChangesListener>();

/** Simulate changes pulled from the cloud. */
export function emitRemoteChanges(
  changes: Parameters<RemoteChangesListener>[0],
): void {
  for (const listener of remoteChangeListeners) listener(changes);
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
      <SyncContext.Provider value={sync}>
        <ListenersContext.Provider value={remoteChangeListeners}>
          {children}
        </ListenersContext.Provider>
      </SyncContext.Provider>
    </AuthContext.Provider>
  );
}
