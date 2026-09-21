import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "./auth";
import * as client from "./client";
import * as library from "./library";

/** The latest session broadcast by the client (null when signed out). */
let latest: unknown = null;
client.onSessionChange((session) => {
  latest = session;
});
const currentSession = () => latest !== null;

const USER = { id: "u1", email: "ada@example.com", date_joined: "x" };

let requestMock: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requestMock = vi.spyOn(client, "request");
});
afterEach(() => client.setSession(null));

describe("auth endpoints", () => {
  it.each([
    ["register", auth.register, "/auth/register/"],
    ["login", auth.login, "/auth/token/"],
  ] as const)("%s adopts the returned session", async (_name, fn, path) => {
    requestMock.mockResolvedValue({ user: USER, access: "a" });

    await expect(fn("ada@example.com", "pw")).resolves.toEqual(USER);

    expect(requestMock).toHaveBeenCalledWith(path, {
      method: "POST",
      body: { email: "ada@example.com", password: "pw" },
      auth: false,
    });
    expect(currentSession()).toBe(true);
  });

  it("logout always clears the session, even offline", async () => {
    client.setSession({ user: USER, access: "a" });
    requestMock.mockRejectedValue(new client.ApiError(0, "network", "x"));

    await expect(auth.logout()).rejects.toBeInstanceOf(client.ApiError);
    expect(currentSession()).toBe(false);
  });

  it("changePassword adopts the fresh session", async () => {
    requestMock.mockResolvedValue({ user: USER, access: "b" });

    await auth.changePassword("old", "new");

    expect(requestMock).toHaveBeenCalledWith("/me/password/", {
      method: "POST",
      body: { current_password: "old", new_password: "new" },
    });
    expect(currentSession()).toBe(true);
  });

  it("updateEmail, reset request and reset confirm hit their endpoints", async () => {
    requestMock.mockResolvedValue(USER);

    await auth.updateEmail("new@example.com", "pw");
    await auth.requestPasswordReset("ada@example.com");
    await auth.confirmPasswordReset("uid", "tok", "pw2");

    expect(requestMock.mock.calls).toEqual([
      [
        "/me/",
        {
          method: "PATCH",
          body: { email: "new@example.com", current_password: "pw" },
        },
      ],
      [
        "/auth/password-reset/",
        { method: "POST", body: { email: "ada@example.com" }, auth: false },
      ],
      [
        "/auth/password-reset/confirm/",
        {
          method: "POST",
          body: { uid: "uid", token: "tok", new_password: "pw2" },
          auth: false,
        },
      ],
    ]);
  });
});

describe("library endpoints", () => {
  it("posts sync payloads and manages logos", async () => {
    requestMock.mockResolvedValue(undefined);
    const payload = { cursor: 3, folders: [], documents: [], settings: null };
    const blob = new Blob(["x"]);

    await library.postSync(payload);
    await library.uploadLogo("d1", blob);
    await library.downloadLogo("d1");
    await library.deleteLogo("d1");

    expect(requestMock.mock.calls).toEqual([
      ["/sync/", { method: "POST", body: payload }],
      ["/documents/d1/logo/", { method: "PUT", body: blob }],
      ["/documents/d1/logo/", { as: "blob" }],
      ["/documents/d1/logo/", { method: "DELETE" }],
    ]);
  });
});
