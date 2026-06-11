/** Make i18next's `t` aware of our catalog shape: keys are checked against the
 *  English resource (the source of truth), so a typo or a key missing from a
 *  translation is a compile error rather than a silent runtime fallback. */

import "i18next";
import type en from "./resources/en.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}
