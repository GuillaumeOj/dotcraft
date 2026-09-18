import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { InputField } from "../components/fields";
import { FormFeedback, useSubmit } from "../components/forms";
import { PageLayout } from "../components/PageLayout";
import { Panel } from "../components/Panel";

/** `/reset-password/:uid/:token`: the link from the reset e-mail. Sets a new
 *  password, then points the user back to sign in. */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const { uid = "", token = "" } = useParams();
  const { confirmPasswordReset } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { pending, errors, succeeded, submit, setErrors } = useSubmit();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setErrors([t("account.passwordMismatch")]);
      return;
    }
    await submit(() => confirmPasswordReset(uid, token, password));
  };

  return (
    <PageLayout title={t("auth.reset.title")}>
      <div className="account">
        <Panel title={t("auth.reset.title")}>
          {succeeded ? (
            <>
              <FormFeedback errors={[]} success={t("auth.reset.done")} />
              <Link className="btn" to="/account">
                {t("account.signIn")}
              </Link>
            </>
          ) : (
            <form className="form" onSubmit={onSubmit}>
              <InputField
                label={t("account.newPassword")}
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={setPassword}
              />
              <InputField
                label={t("account.confirmPassword")}
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={setConfirm}
              />
              <FormFeedback errors={errors} />
              <button type="submit" className="btn" disabled={pending}>
                {t("auth.reset.submit")}
              </button>
              <Link className="form__link" to="/forgot-password">
                {t("auth.reset.requestNew")}
              </Link>
            </form>
          )}
        </Panel>
      </div>
    </PageLayout>
  );
}
