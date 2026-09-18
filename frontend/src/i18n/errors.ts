/** Map a render error thrown by the framework-agnostic QR pipeline (which stays
 *  English, for tests and logs) to a user-facing, translated message. The empty
 *  -content case gets its own copy; anything else falls back to a generic one. */

import type { TFunction } from "i18next";
import { EMPTY_CONTENT_ERROR } from "../qr/render";

export function describeRenderError(message: string, t: TFunction): string {
  if (message === EMPTY_CONTENT_ERROR) return t("errors.enterText");
  return t("errors.couldNotRender");
}
