/** Minimal client for the Dotcraft API (`/api/v1`, same origin).
 *
 *  Authentication: the short-lived JWT access token lives only in memory here;
 *  the long-lived refresh token is an HttpOnly cookie the browser sends to
 *  `/api/v1/auth/` on its own. A request answered 401 triggers one (shared)
 *  refresh and is retried once. Session changes are broadcast to subscribers so
 *  the auth context can follow them. */

export const API_BASE = "/api/v1";

/** A field-level validation error, as returned by the API. */
export interface FieldError {
  code: string;
  message: string;
}

/** An API failure. `status` is 0 when the network request itself failed. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, FieldError[]>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields: Record<string, FieldError[]> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  /** The error codes reported for `field` (empty when none). */
  fieldCodes(field: string): string[] {
    return (this.fields[field] ?? []).map((e) => e.code);
  }
}

/** The signed-in user, as the API describes them. */
export interface ApiUser {
  id: string;
  email: string;
  date_joined: string;
}

/** A successful sign-in: the user plus a fresh access token. */
export interface Session {
  user: ApiUser;
  access: string;
}

let accessToken: string | null = null;
let refreshing: Promise<Session | null> | null = null;
const sessionListeners = new Set<(session: Session | null) => void>();

/** Adopt a new session (or clear it with null) and notify subscribers. */
export function setSession(session: Session | null): void {
  accessToken = session?.access ?? null;
  for (const listener of sessionListeners) listener(session);
}

/** Whether an access token is currently held. */
export function hasSession(): boolean {
  return accessToken !== null;
}

/** Subscribe to session changes (sign-in, refresh, expiry, sign-out). */
export function onSessionChange(
  listener: (session: Session | null) => void,
): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/** Exchange the refresh cookie for a new session. Concurrent callers share one
 *  request. Resolves to null (and clears the session) when signed out. */
export function refreshSession(): Promise<Session | null> {
  refreshing ??= (async () => {
    try {
      const session = await request<Session>("/auth/token/refresh/", {
        method: "POST",
        auth: false,
      });
      setSession(session);
      return session;
    } catch (err) {
      // Only a definitive "no session" signs the user out; a network blip
      // keeps the current state so it can be retried later.
      if (err instanceof ApiError && err.status === 401) setSession(null);
      else throw err;
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** A JSON body (serialised here) or raw bytes (sent as-is, e.g. a logo). */
  body?: unknown;
  /** Send the access token and retry once after refreshing on 401. */
  auth?: boolean;
  /** How to read a successful response. Defaults to JSON (or nothing on 204). */
  as?: "json" | "blob";
}

async function toApiError(response: Response): Promise<ApiError> {
  let data: {
    code?: string;
    detail?: string;
    fields?: Record<string, FieldError[]>;
  } = {};
  try {
    data = await response.json();
  } catch {
    // Not JSON (e.g. a proxy error page): fall back to the status alone.
  }
  return new ApiError(
    response.status,
    data.code ?? `http_${response.status}`,
    data.detail ?? response.statusText,
    data.fields ?? {},
  );
}

/** Call the API. Throws {@link ApiError} on any failure. */
export async function request<T = void>(
  path: string,
  { method = "GET", body, auth = true, as = "json" }: RequestOptions = {},
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body instanceof Blob) {
    payload = body;
    headers["Content-Type"] = body.type || "application/octet-stream";
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: payload,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "network", "Network request failed");
  }

  if (response.status === 401 && auth && !retried) {
    const session = await refreshSession();
    if (session) return request<T>(path, { method, body, auth, as }, true);
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (as === "blob" ? response.blob() : response.json()) as Promise<T>;
}
