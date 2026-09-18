import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { fakeAuth, fakeSync } from "../test/providers";
import { renderWithRouter } from "../test/router";
import { AccountPage } from "./AccountPage";

const USER = {
  id: "u1",
  email: "ada@example.com",
  date_joined: "2026-01-01T00:00:00Z",
};

function renderPage(options: Parameters<typeof renderWithRouter>[1] = {}) {
  return renderWithRouter(
    <Routes>
      <Route path="/account" element={<AccountPage />} />
      <Route path="/" element={<p>Editor</p>} />
      <Route path="/forgot-password" element={<p>Forgot</p>} />
    </Routes>,
    { route: "/account", ...options },
  );
}

const signedIn = (over = {}) =>
  fakeAuth({ status: "authenticated", user: USER, ...over });

describe("AccountPage — signed out", () => {
  it("shows a loading hint while the session is restored", () => {
    renderPage({ auth: fakeAuth({ status: "loading" }) });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("signs in and returns to the editor", async () => {
    const user = userEvent.setup();
    const auth = fakeAuth();
    renderPage({ auth });

    await user.type(screen.getByLabelText("E-mail"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "secret-pass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(auth.login).toHaveBeenCalledWith("ada@example.com", "secret-pass");
    expect(await screen.findByText("Editor")).toBeInTheDocument();
  });

  it("shows translated errors from the API", async () => {
    const user = userEvent.setup();
    const auth = fakeAuth({
      login: vi.fn(async () => {
        throw new ApiError(400, "invalid", "x", {
          non_field_errors: [{ code: "invalid_credentials", message: "" }],
        });
      }),
    });
    renderPage({ auth });

    await user.type(screen.getByLabelText("E-mail"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wrong e-mail or password.",
    );
  });

  it("creates an account after checking the confirmation", async () => {
    const user = userEvent.setup();
    const auth = fakeAuth();
    renderPage({ auth });

    await user.click(screen.getByRole("tab", { name: "Create account" }));
    await user.type(screen.getByLabelText("E-mail"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "a-long-secret");
    await user.type(screen.getByLabelText("Confirm password"), "different");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The passwords don't match.",
    );
    expect(auth.register).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "a-long-secret");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(auth.register).toHaveBeenCalledWith(
      "new@example.com",
      "a-long-secret",
    );
  });

  it("links to the password reset", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("link", { name: "Forgot your password?" }),
    );

    expect(screen.getByText("Forgot")).toBeInTheDocument();
  });
});

describe("AccountPage — signed in", () => {
  it("shows the account and its sync state", async () => {
    const user = userEvent.setup();
    const sync = fakeSync({ lastSyncedAt: Date.UTC(2026, 0, 2) });
    renderPage({ auth: signedIn(), sync });

    expect(
      screen.getByText("Signed in as ada@example.com"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Synced").length).toBeGreaterThan(0);
    expect(screen.getByText(/^Last synced/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sync now" }));
    expect(sync.syncNow).toHaveBeenCalled();
  });

  it("says when it hasn't synced yet and disables syncing meanwhile", () => {
    renderPage({ auth: signedIn(), sync: fakeSync({ status: "syncing" }) });

    expect(screen.getByText("Not synced yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
  });

  it("updates the e-mail", async () => {
    const user = userEvent.setup();
    const auth = signedIn();
    renderPage({ auth });

    const email = screen.getByLabelText("New e-mail");
    await user.clear(email);
    await user.type(email, "lovelace@example.com");
    const [current] = screen.getAllByLabelText("Current password");
    await user.type(current, "pw");
    await user.click(screen.getByRole("button", { name: "Update e-mail" }));

    expect(auth.updateEmail).toHaveBeenCalledWith("lovelace@example.com", "pw");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your e-mail address was updated.",
    );
    expect(current).toHaveValue("");
  });

  it("changes the password", async () => {
    const user = userEvent.setup();
    const auth = signedIn();
    renderPage({ auth });

    const [, current] = screen.getAllByLabelText("Current password");
    await user.type(current, "old-pass");
    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.type(screen.getByLabelText("Confirm password"), "mismatch");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The passwords don't match.",
    );

    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "new-password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(auth.changePassword).toHaveBeenCalledWith(
      "old-pass",
      "new-password",
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your password was changed.",
    );
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("signs out and returns to the editor", async () => {
    const user = userEvent.setup();
    const sync = fakeSync();
    renderPage({ auth: signedIn(), sync });

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(sync.signOut).toHaveBeenCalledWith({ force: false });
    expect(await screen.findByText("Editor")).toBeInTheDocument();
  });

  it("warns about unsynced changes before signing out", async () => {
    const user = userEvent.setup();
    const signOut = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    renderPage({ auth: signedIn(), sync: fakeSync({ signOut }) });

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Unsynced changes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByText("Unsynced changes")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await user.click(
      await screen.findByRole("button", { name: "Sign out anyway" }),
    );

    expect(signOut).toHaveBeenLastCalledWith({ force: true });
    expect(await screen.findByText("Editor")).toBeInTheDocument();
  });
});
