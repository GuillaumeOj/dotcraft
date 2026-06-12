import { ChevronDown, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LOCALE_LABELS, LOCALES, type Locale } from "../i18n/locales";

/** The interface-language picker. Presentational: the parent owns the change
 *  handler (which also persists the choice). `className` lets the same control
 *  style as the desktop header pill or a full-width navbar-menu row. */
export function LanguageSelect({
  className,
  value,
  onChange,
}: {
  className?: string;
  value: string;
  onChange: (locale: Locale) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={className ? `app__lang ${className}` : "app__lang"}>
      <Languages className="app__lang-icon" size={15} aria-hidden="true" />
      <select
        className="app__lang-select"
        aria-label={t("app.language")}
        value={value}
        onChange={(e) => onChange(e.target.value as Locale)}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
      <ChevronDown className="app__lang-caret" size={15} aria-hidden="true" />
    </div>
  );
}
