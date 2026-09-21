/** Turn API failures into translated, user-facing messages. The API reports
 *  machine-readable codes (see backend `core/exceptions.py`); unknown codes fall
 *  back to a generic message. */

import type { TFunction } from "i18next";
import { ApiError } from "../api/client";

const KNOWN_CODES = [
  "invalid_credentials",
  "email_taken",
  "wrong_password",
  "password_too_short",
  "password_too_common",
  "password_entirely_numeric",
  "password_too_similar",
  "invalid_token",
  "throttled",
  "network",
] as const;
type KnownCode = (typeof KNOWN_CODES)[number];

const isKnown = (code: string): code is KnownCode =>
  (KNOWN_CODES as readonly string[]).includes(code);

function messageFor(code: string, t: TFunction): string {
  return isKnown(code) ? t(`apiErrors.${code}`) : t("apiErrors.generic");
}

/** Every translated message for `err`: one per reported field error (e-mail
 *  format errors get their own copy), or a single overall message. */
export function errorMessages(err: unknown, t: TFunction): string[] {
  if (!(err instanceof ApiError)) return [t("apiErrors.generic")];
  const messages = Object.keys(err.fields).flatMap((field) =>
    err
      .fieldCodes(field)
      .map((code) =>
        code === "invalid" && field.includes("email")
          ? t("apiErrors.invalidEmail")
          : messageFor(code, t),
      ),
  );
  return messages.length > 0
    ? [...new Set(messages)]
    : [messageFor(err.code, t)];
}
