import { Info } from "lucide-react";
import { Link } from "react-router-dom";

/** A small info affordance next to a control: deep-links to the matching Help
 *  Center article (`/help-center#<anchor>`). The `label` is the accessible name,
 *  since the icon itself is decorative. */
export function InfoLink({ anchor, label }: { anchor: string; label: string }) {
  return (
    <Link
      className="info-link"
      to={`/help-center#${anchor}`}
      aria-label={label}
      title={label}
    >
      <Info size={14} aria-hidden="true" />
    </Link>
  );
}
