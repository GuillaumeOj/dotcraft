import { ChevronDown } from "lucide-react";
import { type ReactNode, useId } from "react";

/** Fold controls shared by every collapsible editor panel. `collapsible` is the
 *  mobile gate: when false (desktop), the panel renders a plain, always-open
 *  fieldset identical to before, so the fold state persists but never shows. */
export interface FoldProps {
  collapsible: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

/** A `.panel` fieldset whose legend doubles as a disclosure toggle on mobile.
 *  Follows the WAI-ARIA accordion pattern: the toggle's accessible name is the
 *  panel title and `aria-expanded` conveys the open/closed state. */
export function CollapsiblePanel({
  title,
  collapsible = false,
  collapsed = false,
  onToggle = () => {},
  children,
}: Partial<FoldProps> & { title: string; children: ReactNode }) {
  const bodyId = useId();
  const isCollapsed = collapsible && collapsed;
  return (
    <fieldset className={isCollapsed ? "panel is-collapsed" : "panel"}>
      <legend>
        {collapsible ? (
          <button
            type="button"
            className="panel__toggle"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={onToggle}
          >
            <span>{title}</span>
            <ChevronDown
              className="panel__chevron"
              size={14}
              aria-hidden="true"
            />
          </button>
        ) : (
          title
        )}
      </legend>
      <div id={bodyId} className="panel__body">
        {children}
      </div>
    </fieldset>
  );
}
