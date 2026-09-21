import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { FormFeedback, useNewPassword, useSubmit } from "../components/forms";
import { PageLayout } from "../components/PageLayout";
import { Panel } from "../components/Panel";

/** `/reset-password/:uid/:token`: the link from the reset e-mail. Sets a new
 *  password, then points the user back to sign in. */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const { uid = "", token = "" } = useParams();
  const { confirmPasswordReset } = useAuth();
  const newPassword = useNewPassword();
  const { pending, errors, succeeded, submit } = useSubmit();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await submit(
      () => confirmPasswordReset(uid, token, newPassword.password),
      newPassword.mismatch,
    );
  };

  return (
    <PageLayout title={t("auth.reset.title")} centered>
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
              {newPassword.fields(t("account.newPassword"))}
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
