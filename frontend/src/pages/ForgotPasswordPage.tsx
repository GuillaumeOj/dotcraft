import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { TextField } from "../components/fields";
import { FormFeedback, useSubmit } from "../components/forms";
import { PageLayout } from "../components/PageLayout";
import { Panel } from "../components/Panel";

/** `/forgot-password`: ask for a password-reset e-mail. The answer is the same
 *  whether or not the address has an account, so it can't be probed. */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { pending, errors, submit } = useSubmit();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (await submit(() => requestPasswordReset(email))) setSentTo(email);
  };

  return (
    <PageLayout title={t("auth.forgot.title")} centered>
      <div className="account">
        <Panel title={t("auth.forgot.title")}>
          <p className="hint">{t("auth.forgot.intro")}</p>
          <form className="form" onSubmit={onSubmit}>
            <TextField
              label={t("account.email")}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={setEmail}
            />
            <FormFeedback
              errors={errors}
              success={sentTo ? t("auth.forgot.sent", { email: sentTo }) : null}
            />
            <button type="submit" className="btn" disabled={pending}>
              {t("auth.forgot.submit")}
            </button>
            <Link className="form__link" to="/account">
              {t("auth.backToSignIn")}
            </Link>
          </form>
        </Panel>
      </div>
    </PageLayout>
  );
}
