import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fakeAuth, fakeSync } from "../test/providers";
import { renderWithRouter } from "../test/router";
import { AccountButton } from "./AccountButton";
import { SyncBadge } from "./SyncBadge";

describe("AccountButton", () => {
  it("invites to sign in when signed out", () => {
    renderWithRouter(<AccountButton />);

    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/account");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Learn about accounts and cloud sync",
      }),
    ).toHaveAttribute("href", "/help-center#account");
  });

  it("shows the account e-mail and the sync state when signed in", () => {
    renderWithRouter(<AccountButton />, {
      auth: fakeAuth({
        status: "authenticated",
        user: { id: "u1", email: "ada@example.com", date_joined: "x" },
      }),
      sync: fakeSync({ status: "offline" }),
    });

    expect(
      screen.getByRole("link", { name: "Account: ada@example.com" }),
    ).toHaveTextContent("ada@example.com");
    expect(
      screen.getByRole("img", {
        name: "Offline — changes will sync when you're back online",
      }),
    ).toBeInTheDocument();
  });
});

describe("SyncBadge", () => {
  it.each([
    ["idle", "Synced"],
    ["syncing", "Syncing…"],
    ["error", "Sync failed — retrying shortly"],
  ] as const)("labels the %s state", (status, label) => {
    renderWithRouter(<SyncBadge status={status} />);
    expect(screen.getByRole("img", { name: label })).toHaveClass(
      `sync-badge--${status}`,
    );
  });
});
