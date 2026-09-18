import { act, render, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { Auth } from "../auth/AuthProvider";
import i18n from "../i18n/config";
import { markDirty } from "../qr/storage";
import { resetDb } from "../test/db";
import { fakeAuth, TestProviders } from "../test/providers";
import * as engine from "./engine";
import {
  PUSH_DELAY_MS,
  SyncProvider,
  useRemoteChanges,
  useSync,
} from "./SyncProvider";

vi.mock("./engine", () => ({
  adoptAccount: vi.fn(),
  syncOnce: vi.fn(),
  hasPendingChanges: vi.fn(),
}));
const adoptAccount = vi.mocked(engine.adoptAccount);
const syncOnce = vi.mocked(engine.syncOnce);
const hasPendingChanges = vi.mocked(engine.hasPendingChanges);

const NONE = { library: false, documentIds: [], settings: null };
const USER = { id: "u1", email: "ada@example.com", date_joined: "x" };

function setup(auth: Auth = fakeAuth({ status: "authenticated", user: USER })) {
  const listener = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders auth={auth}>
      <SyncProvider>{children}</SyncProvider>
    </TestProviders>
  );
  const hook = renderHook(
    () => {
      useRemoteChanges(listener);
      return useSync();
    },
    { wrapper },
  );
  return { ...hook, listener, auth };
}

beforeEach(async () => {
  await resetDb();
  adoptAccount.mockReset().mockResolvedValue(NONE);
  syncOnce.mockReset().mockResolvedValue(NONE);
  hasPendingChanges.mockReset().mockResolvedValue(false);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("SyncProvider", () => {
  it("stays idle while signed out", async () => {
    const { result } = setup(fakeAuth());

    await act(() => result.current.syncNow());

    expect(result.current.status).toBe("idle");
    expect(adoptAccount).not.toHaveBeenCalled();
  });

  it("adopts the account and syncs on sign-in", async () => {
    const { result } = setup();

    await waitFor(() => expect(result.current.lastSyncedAt).not.toBeNull());
    expect(adoptAccount).toHaveBeenCalledWith("u1");
    expect(syncOnce).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");

    // Adoption happens once per account.
    await act(() => result.current.syncNow());
    expect(adoptAccount).toHaveBeenCalledTimes(1);
    expect(syncOnce).toHaveBeenCalledTimes(2);
  });

  it("broadcasts remote changes and applies a synced language", async () => {
    const changeLanguage = vi.spyOn(i18n, "changeLanguage");
    syncOnce.mockResolvedValueOnce({
      library: true,
      documentIds: ["d1"],
      settings: { locale: "fr", colorFormat: null, updatedAt: 1 },
    });
    const { listener } = setup();

    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ documentIds: ["d1"] }),
    );
    expect(changeLanguage).toHaveBeenCalledWith("fr");
    await act(() => i18n.changeLanguage("en"));
  });

  it("does not broadcast when nothing changed", async () => {
    const { result, listener } = setup();
    await waitFor(() => expect(result.current.lastSyncedAt).not.toBeNull());

    expect(listener).not.toHaveBeenCalled();
  });

  it("coalesces requests made while a sync is running", async () => {
    let release = () => {};
    syncOnce.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve(NONE))),
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe("syncing"));

    const pending = result.current.syncNow();
    await act(async () => {
      release();
      await pending;
    });

    await waitFor(() => expect(syncOnce).toHaveBeenCalledTimes(2));
  });

  it("pushes shortly after a local change", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.lastSyncedAt).not.toBeNull());
    // Only fake the timers: fake-indexeddb schedules its work with setImmediate.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    await act(() => markDirty("folder", "f1"));
    expect(syncOnce).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(PUSH_DELAY_MS));

    expect(syncOnce).toHaveBeenCalledTimes(2);
  });

  it("syncs when the tab becomes visible or the network returns", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.lastSyncedAt).not.toBeNull());

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(syncOnce).toHaveBeenCalledTimes(2));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(syncOnce).toHaveBeenCalledTimes(3));
  });

  it("reports offline and retries with backoff", async () => {
    syncOnce
      .mockRejectedValueOnce(new ApiError(0, "network", "x"))
      .mockRejectedValueOnce(new ApiError(500, "http_500", "x"));
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout"],
      shouldAdvanceTime: true,
    });
    const { result } = setup();

    await waitFor(() => expect(result.current.status).toBe("offline"));
    await act(() => vi.advanceTimersByTimeAsync(PUSH_DELAY_MS));
    await waitFor(() => expect(result.current.status).toBe("error"));
    await act(() => vi.advanceTimersByTimeAsync(PUSH_DELAY_MS * 2));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(syncOnce).toHaveBeenCalledTimes(3);
  });

  describe("signOut", () => {
    it("flushes, ends the session and wipes the device", async () => {
      const { result, listener, auth } = setup();
      await waitFor(() => expect(result.current.lastSyncedAt).not.toBeNull());

      let done = false;
      await act(async () => {
        done = await result.current.signOut();
      });

      expect(done).toBe(true);
      expect(auth.endSession).toHaveBeenCalled();
      expect(listener).toHaveBeenLastCalledWith({
        library: true,
        documentIds: [],
        settings: null,
      });
    });

    it("refuses while changes are pending, unless forced", async () => {
      hasPendingChanges.mockResolvedValue(true);
      const auth = fakeAuth({
        status: "authenticated",
        user: USER,
        endSession: vi.fn(async () => {
          throw new ApiError(0, "network", "offline");
        }),
      });
      const { result } = setup(auth);
      await waitFor(() => expect(result.current.lastSyncedAt).not.toBeNull());

      let done = true;
      await act(async () => {
        done = await result.current.signOut();
      });
      expect(done).toBe(false);
      expect(auth.endSession).not.toHaveBeenCalled();

      await act(async () => {
        done = await result.current.signOut({ force: true });
      });
      expect(done).toBe(true);
      expect(auth.endSession).toHaveBeenCalled();
    });
  });

  it("requires the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Orphan() {
      useSync();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/SyncProvider/);
  });

  it("lets remote-change subscribers render without a provider", () => {
    const { unmount } = renderHook(() => useRemoteChanges(() => {}));
    unmount();
  });
});
