import { ChevronDown } from "lucide-react";
import { type ReactNode, useId } from "react";

/** Fold controls shared by every collapsible editor panel. `collapsible` is the
 *  mobile gate: when false (desktop), the panel renders a plain, always-open
 *  surface, so the fold state persists but never shows. */
export interface FoldProps {
  collapsible: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

/** A bordered `.panel` surface whose title is a heading inside the card. When
 *  `collapsible` (mobile), the heading doubles as a disclosure toggle following
 *  the WAI-ARIA accordion pattern: the toggle's accessible name is the panel
 *  title, `aria-expanded` conveys the open/closed state, and only the body folds
 *  away — the title stays visible. The body is wrapped so it can hide as a unit
 *  only when collapsible; static panels keep their content as direct children so
 *  layout selectors (e.g. `.sidebar__panel > .tree`) still apply. */
export function Panel({
  title,
  className,
  collapsible = false,
  collapsed = false,
  onToggle = () => {},
  children,
}: Partial<FoldProps> & {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const bodyId = useId();
  const isCollapsed = collapsible && collapsed;
  const cls = `panel${className ? ` ${className}` : ""}${
    isCollapsed ? " is-collapsed" : ""
  }`;
  return (
    <section className={cls}>
      <h2 className="panel__title">
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
      </h2>
      {collapsible ? (
        <div id={bodyId} className="panel__body">
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
