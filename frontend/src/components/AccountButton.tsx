import { CircleUserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useSync } from "../sync/SyncProvider";
import { InfoLink } from "./InfoLink";
import { SyncBadge } from "./SyncBadge";

/** The account row of the library footer: a link to the account view (sign in
 *  when anonymous, the account e-mail and sync state when signed in). */
export function AccountButton() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { status } = useSync();
  // Short labels on purpose: the library column is narrow enough that a longer
  // translation would be clipped mid-word.
  const label = user ? t("sidebar.account") : t("account.signIn");
  return (
    <div className="sidebar__account-row">
      <Link
        to="/account"
        className="sidebar__account"
        aria-label={user ? `${label}: ${user.email}` : label}
        title={label}
      >
        <CircleUserRound size={16} aria-hidden="true" />
        <span className="sidebar__account-label">{user?.email ?? label}</span>
        {user && <SyncBadge status={status} size={14} />}
      </Link>
      <InfoLink anchor="account" label={t("info.account")} />
    </div>
  );
}
