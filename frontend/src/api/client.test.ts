import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  onSessionChange,
  refreshSession,
  request,
  type Session,
  setSession,
} from "./client";

/** The latest session broadcast by the client (null when signed out). */
let latest: unknown = null;
onSessionChange((session) => {
  latest = session;
});
const currentSession = () => latest !== null;

const SESSION: Session = {
  user: { id: "u1", email: "ada@example.com", date_joined: "2026-01-01" },
  access: "token-1",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => setSession(null));

describe("request", () => {
  it("sends JSON with the access token and parses the response", async () => {
    setSession(SESSION);
    const fetchMock = mockFetch(json(200, { ok: true }));

    await expect(
      request("/thing/", { method: "POST", body: { a: 1 } }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/thing/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-1",
      },
      body: '{"a":1}',
      credentials: "same-origin",
    });
  });

  it("sends blobs as-is and can read a blob back", async () => {
    const fetchMock = mockFetch(new Response("x"));
    const blob = new Blob(["png"], { type: "image/png" });

    const result = await request<Blob>("/logo/", {
      method: "PUT",
      body: blob,
      auth: false,
      as: "blob",
    });

    expect(result.size).toBe(1);
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.body).toBe(blob);
    expect(init.headers).toEqual({ "Content-Type": "image/png" });
  });

  it("falls back to octet-stream for untyped blobs and resolves 204s", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));

    await expect(
      request("/x/", { method: "PUT", body: new Blob(["?"]) }),
    ).resolves.toBeUndefined();
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.headers).toEqual({
      "Content-Type": "application/octet-stream",
    });
  });

  it("turns error bodies into ApiErrors with field codes", async () => {
    mockFetch(
      json(400, {
        code: "invalid",
        detail: "Invalid input.",
        fields: { email: [{ code: "email_taken", message: "taken" }] },
      }),
    );

    const err = await request("/x/").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid");
    expect(err.fieldCodes("email")).toEqual(["email_taken"]);
    expect(err.fieldCodes("password")).toEqual([]);
  });

  it("handles non-JSON error bodies", async () => {
    mockFetch(new Response("<html>", { status: 502, statusText: "Bad" }));

    const err = await request("/x/").catch((e) => e);

    expect(err.code).toBe("http_502");
    expect(err.message).toBe("Bad");
  });

  it("handles a null JSON error body", async () => {
    mockFetch(json(500, null));

    const err = await request("/x/").catch((e) => e);

    expect(err.code).toBe("http_500");
  });

  it("reports network failures with status 0", async () => {
    mockFetch(new TypeError("offline"));

    const err = await request("/x/").catch((e) => e);

    expect(err).toMatchObject({ status: 0, code: "network" });
  });

  it("refreshes the session once on 401 and retries", async () => {
    setSession(SESSION);
    const fetchMock = mockFetch(
      json(401, { code: "not_authenticated" }),
      json(200, { ...SESSION, access: "token-2" }),
      json(200, { ok: 1 }),
    );

    await expect(request("/x/")).resolves.toEqual({ ok: 1 });

    const retry = (fetchMock.mock.calls[2] as unknown[])[1] as RequestInit;
    expect(retry.headers).toEqual({ Authorization: "Bearer token-2" });
  });

  it("gives up when the refresh fails", async () => {
    setSession(SESSION);
    mockFetch(
      json(401, { code: "not_authenticated" }),
      json(401, { code: "invalid_session" }),
    );

    const err = await request("/x/").catch((e) => e);

    expect(err.status).toBe(401);
    expect(currentSession()).toBe(false);
  });

  it("does not retry unauthenticated calls", async () => {
    const fetchMock = mockFetch(json(401, { code: "no_session" }));

    await expect(request("/x/", { auth: false })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sessions", () => {
  it("broadcasts session changes until unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = onSessionChange(listener);

    setSession(SESSION);
    unsubscribe();
    setSession(null);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(SESSION);
  });

  it("shares one refresh between concurrent callers", async () => {
    const fetchMock = mockFetch(json(200, SESSION));

    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);

    expect(a).toEqual(SESSION);
    expect(b).toEqual(SESSION);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(currentSession()).toBe(true);
  });

  it("keeps the session on a network error during refresh", async () => {
    setSession(SESSION);
    mockFetch(new TypeError("offline"));

    await expect(refreshSession()).rejects.toMatchObject({ status: 0 });
    expect(currentSession()).toBe(true);
  });
});
