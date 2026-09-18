/** Account endpoints. Each sign-in style call adopts the returned session. */

import { type ApiUser, request, type Session, setSession } from "./client";

async function adopt(promise: Promise<Session>): Promise<ApiUser> {
  const session = await promise;
  setSession(session);
  return session.user;
}

export function register(email: string, password: string): Promise<ApiUser> {
  return adopt(
    request<Session>("/auth/register/", {
      method: "POST",
      body: { email, password },
      auth: false,
    }),
  );
}

export function login(email: string, password: string): Promise<ApiUser> {
  return adopt(
    request<Session>("/auth/token/", {
      method: "POST",
      body: { email, password },
      auth: false,
    }),
  );
}

/** Revoke the refresh cookie server-side and forget the session. Always clears
 *  the local session, even when the request fails (e.g. offline). */
export async function logout(): Promise<void> {
  try {
    await request("/auth/logout/", { method: "POST", auth: false });
  } finally {
    setSession(null);
  }
}

export function updateEmail(
  email: string,
  currentPassword: string,
): Promise<ApiUser> {
  return request<ApiUser>("/me/", {
    method: "PATCH",
    body: { email, current_password: currentPassword },
  });
}

/** Change the password. Other devices are signed out; this one gets a new
 *  session. */
export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<ApiUser> {
  return adopt(
    request<Session>("/me/password/", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    }),
  );
}

export function requestPasswordReset(email: string): Promise<void> {
  return request("/auth/password-reset/", {
    method: "POST",
    body: { email },
    auth: false,
  });
}

export function confirmPasswordReset(
  uid: string,
  token: string,
  newPassword: string,
): Promise<void> {
  return request("/auth/password-reset/confirm/", {
    method: "POST",
    body: { uid, token, new_password: newPassword },
    auth: false,
  });
}
