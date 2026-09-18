import { act, render, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authApi from "../api/auth";
import * as client from "../api/client";
import { ApiError, type Session } from "../api/client";
import { AuthProvider, useAuth } from "./AuthProvider";

const SESSION: Session = {
  user: { id: "u1", email: "ada@example.com", date_joined: "x" },
  access: "a",
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

let refresh: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  refresh = vi.spyOn(client, "refreshSession");
});
afterEach(() => client.setSession(null));

describe("AuthProvider", () => {
  it("restores the session from the refresh cookie", async () => {
    refresh.mockImplementation(async () => {
      client.setSession(SESSION);
      return SESSION;
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.user?.email).toBe("ada@example.com");
  });

  it("is anonymous without a session", async () => {
    refresh.mockImplementation(async () => {
      client.setSession(null);
      return null;
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.user).toBeNull();
  });

  it("stays signed out while offline and retries once back online", async () => {
    refresh
      .mockRejectedValueOnce(new ApiError(0, "network", "offline"))
      .mockImplementationOnce(async () => {
        client.setSession(SESSION);
        return SESSION;
      });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("anonymous"));

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("follows sign-in and sign-out broadcasts", async () => {
    refresh.mockResolvedValue(null);
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => client.setSession(SESSION));
    expect(result.current.user?.id).toBe("u1");

    act(() => client.setSession(null));
    expect(result.current.status).toBe("anonymous");
  });

  it("updates the user after an e-mail change", async () => {
    refresh.mockImplementation(async () => {
      client.setSession(SESSION);
      return SESSION;
    });
    vi.spyOn(authApi, "updateEmail").mockResolvedValue({
      ...SESSION.user,
      email: "new@example.com",
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(() => result.current.updateEmail("new@example.com", "pw"));

    expect(result.current.user?.email).toBe("new@example.com");
  });

  it("exposes the account endpoints", async () => {
    refresh.mockResolvedValue(null);
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.login).toBe(authApi.login);
    expect(result.current.register).toBe(authApi.register);
    expect(result.current.endSession).toBe(authApi.logout);
    expect(result.current.changePassword).toBe(authApi.changePassword);
    expect(result.current.requestPasswordReset).toBe(
      authApi.requestPasswordReset,
    );
    expect(result.current.confirmPasswordReset).toBe(
      authApi.confirmPasswordReset,
    );
  });

  it("requires the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Orphan() {
      useAuth();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/AuthProvider/);
  });
});
