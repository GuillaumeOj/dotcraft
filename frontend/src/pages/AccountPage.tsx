import { LogOut, RefreshCw } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { type Auth, useAuth } from "../auth/AuthProvider";
import { TextField } from "../components/fields";
import { FormFeedback, useNewPassword, useSubmit } from "../components/forms";
import { InfoLink } from "../components/InfoLink";
import { ConfirmDialog } from "../components/Modal";
import { PageLayout } from "../components/PageLayout";
import { Panel } from "../components/Panel";
import { SyncBadge } from "../components/SyncBadge";
import { Tabs } from "../components/Tabs";
import { useSync } from "../sync/SyncProvider";

type AuthMode = "signIn" | "signUp";

function SignInForm({ auth }: { auth: Auth }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const newPassword = useNewPassword();
  const { pending, errors, submit, clearErrors } = useSubmit();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ok =
      mode === "signIn"
        ? await submit(() => auth.login(email, password))
        : await submit(
            () => auth.register(email, newPassword.password),
            newPassword.mismatch,
          );
    if (ok) navigate("/");
  };

  return (
    <Panel title={t("account.welcomeTitle")}>
      <p className="hint account__pitch">{t("account.pitch")}</p>
      <Tabs
        value={mode}
        tabs={[
          { id: "signIn", label: t("account.signIn") },
          { id: "signUp", label: t("account.signUp") },
        ]}
        onChange={(next) => {
          setMode(next);
          clearErrors();
        }}
      />
      <form className="form" onSubmit={onSubmit}>
        <TextField
          label={t("account.email")}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
        />
        {mode === "signIn" ? (
          <TextField
            label={t("account.password")}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={setPassword}
          />
        ) : (
          newPassword.fields(t("account.password"))
        )}
        <FormFeedback errors={errors} />
        <button type="submit" className="btn" disabled={pending}>
          {mode === "signIn" ? t("account.signIn") : t("account.signUp")}
        </button>
        {mode === "signIn" && (
          <Link className="form__link" to="/forgot-password">
            {t("account.forgotPassword")}
          </Link>
        )}
      </form>
    </Panel>
  );
}

function SyncSection() {
  const { t, i18n } = useTranslation();
  const { status, lastSyncedAt, syncNow } = useSync();
  const when = lastSyncedAt
    ? t("sync.lastSynced", {
        time: new Date(lastSyncedAt).toLocaleString(i18n.language),
      })
    : t("sync.never");
  return (
    <Panel
      title={t("account.syncTitle")}
      info={<InfoLink anchor="account" label={t("info.account")} />}
    >
      <p className="account__sync">
        <SyncBadge status={status} />
        <span>{t(`sync.status.${status}`)}</span>
      </p>
      <p className="hint">{when}</p>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={status === "syncing"}
        onClick={() => void syncNow()}
      >
        <RefreshCw size={15} aria-hidden="true" />
        {t("sync.syncNow")}
      </button>
    </Panel>
  );
}

function EmailForm({ auth }: { auth: Auth }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(auth.user?.email ?? "");
  const [password, setPassword] = useState("");
  const { pending, errors, succeeded, submit } = useSubmit();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (await submit(() => auth.updateEmail(email, password))) setPassword("");
  };

  return (
    <Panel title={t("account.emailTitle")}>
      <form className="form" onSubmit={onSubmit}>
        <TextField
          label={t("account.newEmail")}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
        />
        <TextField
          label={t("account.currentPassword")}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={setPassword}
        />
        <FormFeedback
          errors={errors}
          success={succeeded ? t("account.emailUpdated") : null}
        />
        <button type="submit" className="btn" disabled={pending}>
          {t("account.updateEmail")}
        </button>
      </form>
    </Panel>
  );
}

function PasswordForm({ auth }: { auth: Auth }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const newPassword = useNewPassword();
  const { pending, errors, succeeded, submit } = useSubmit();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const changed = await submit(
      () => auth.changePassword(current, newPassword.password),
      newPassword.mismatch,
    );
    if (changed) {
      setCurrent("");
      newPassword.reset();
    }
  };

  return (
    <Panel title={t("account.passwordTitle")}>
      <form className="form" onSubmit={onSubmit}>
        <TextField
          label={t("account.currentPassword")}
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={setCurrent}
        />
        {newPassword.fields(t("account.newPassword"))}
        <FormFeedback
          errors={errors}
          success={succeeded ? t("account.passwordUpdated") : null}
        />
        <button type="submit" className="btn" disabled={pending}>
          {t("account.changePassword")}
        </button>
      </form>
    </Panel>
  );
}

function SignOutSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signOut } = useSync();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const run = async (force: boolean) => {
    setConfirming(false);
    setPending(true);
    const done = await signOut({ force });
    setPending(false);
    if (done) navigate("/");
    else setConfirming(true);
  };

  return (
    <Panel title={t("account.signOutTitle")}>
      <p className="hint">{t("account.signOutHint")}</p>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={pending}
        onClick={() => void run(false)}
      >
        <LogOut size={15} aria-hidden="true" />
        {t("account.signOut")}
      </button>
      <ConfirmDialog
        open={confirming}
        title={t("account.unsyncedTitle")}
        message={t("account.unsyncedMessage")}
        confirmLabel={t("account.signOutAnyway")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void run(true)}
        onCancel={() => setConfirming(false)}
      />
    </Panel>
  );
}

/** The account view (`/account`): sign in / create an account when anonymous;
 *  otherwise the sync status and the e-mail, password and sign-out settings. */
export function AccountPage() {
  const { t } = useTranslation();
  const auth = useAuth();

  let content: ReactNode;
  if (auth.status === "loading") {
    content = <p className="hint">{t("account.loading")}</p>;
  } else if (!auth.user) {
    content = <SignInForm auth={auth} />;
  } else {
    content = (
      <>
        <p className="account__signed-in">
          {t("account.signedInAs", { email: auth.user.email })}
        </p>
        <SyncSection />
        <EmailForm auth={auth} />
        <PasswordForm auth={auth} />
        <SignOutSection />
      </>
    );
  }

  return (
    <PageLayout
      title={t("account.title")}
      subtitle={t("account.subtitle")}
      // Signed out there is a single short form: centre it. Signed in the page
      // is a stack of settings panels, which reads better from the top.
      centered={!auth.user}
    >
      <div className="account">{content}</div>
    </PageLayout>
  );
}
