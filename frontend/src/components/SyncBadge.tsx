import { CloudAlert, CloudCheck, CloudOff, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SyncStatus } from "../sync/SyncProvider";

const ICONS = {
  idle: CloudCheck,
  syncing: RefreshCw,
  offline: CloudOff,
  error: CloudAlert,
} as const;

/** A small icon conveying the cloud sync state, labelled for screen readers. */
export function SyncBadge({
  status,
  size = 15,
}: {
  status: SyncStatus;
  size?: number;
}) {
  const { t } = useTranslation();
  const Icon = ICONS[status];
  const label = t(`sync.status.${status}`);
  return (
    <span
      className={`sync-badge sync-badge--${status}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon size={size} aria-hidden="true" />
    </span>
  );
}
