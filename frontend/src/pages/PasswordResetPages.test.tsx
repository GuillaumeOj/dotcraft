import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { fakeAuth } from "../test/providers";
import { renderWithRouter } from "../test/router";
import { ForgotPasswordPage } from "./ForgotPasswordPage";
import { ResetPasswordPage } from "./ResetPasswordPage";

describe("ForgotPasswordPage", () => {
  it("requests a reset link and confirms without revealing the account", async () => {
    const user = userEvent.setup();
    const auth = fakeAuth();
    renderWithRouter(<ForgotPasswordPage />, { auth });

    await user.type(screen.getByLabelText("E-mail"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(auth.requestPasswordReset).toHaveBeenCalledWith("ada@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If an account exists for ada@example.com",
    );
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/account");
  });

  it("shows errors such as throttling", async () => {
    const user = userEvent.setup();
    const auth = fakeAuth({
      requestPasswordReset: vi.fn(async () => {
        throw new ApiError(429, "throttled", "x");
      }),
    });
    renderWithRouter(<ForgotPasswordPage />, { auth });

    await user.type(screen.getByLabelText("E-mail"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts.",
    );
  });
});

describe("ResetPasswordPage", () => {
  function renderReset(auth = fakeAuth()) {
    renderWithRouter(
      <Routes>
        <Route
          path="/reset-password/:uid/:token"
          element={<ResetPasswordPage />}
        />
      </Routes>,
      { route: "/reset-password/abc/tok-123", auth },
    );
    return auth;
  }

  it("sets the new password from the link", async () => {
    const user = userEvent.setup();
    const auth = renderReset();

    await user.type(screen.getByLabelText("New password"), "a-new-secret");
    await user.type(screen.getByLabelText("Confirm password"), "nope");
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The passwords don't match.",
    );

    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "a-new-secret");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    expect(auth.confirmPasswordReset).toHaveBeenCalledWith(
      "abc",
      "tok-123",
      "a-new-secret",
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your password was changed.",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/account",
    );
  });

  it("explains an expired link and offers a new one", async () => {
    const user = userEvent.setup();
    renderReset(
      fakeAuth({
        confirmPasswordReset: vi.fn(async () => {
          throw new ApiError(400, "invalid", "x", {
            token: [{ code: "invalid_token", message: "" }],
          });
        }),
      }),
    );

    await user.type(screen.getByLabelText("New password"), "a-new-secret");
    await user.type(screen.getByLabelText("Confirm password"), "a-new-secret");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This reset link is invalid or has expired.",
    );
    expect(
      screen.getByRole("link", { name: "Request a new link" }),
    ).toHaveAttribute("href", "/forgot-password");
  });
});
