import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessages } from "../auth/errors";
import { TextField } from "./fields";

/** Run a form submission: tracks the pending state, collects translated error
 *  messages, and reports success. `precheck` can refuse the submission with a
 *  message before anything is sent. */
export function useSubmit() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [succeeded, setSucceeded] = useState(false);
  const submit = async (
    action: () => Promise<unknown>,
    precheck?: () => string | null,
  ) => {
    setSucceeded(false);
    const refusal = precheck?.();
    if (refusal) {
      setErrors([refusal]);
      return false;
    }
    setPending(true);
    setErrors([]);
    try {
      await action();
      setSucceeded(true);
      return true;
    } catch (err) {
      setErrors(errorMessages(err, t));
      return false;
    } finally {
      setPending(false);
    }
  };
  return {
    pending,
    errors,
    succeeded,
    submit,
    clearErrors: () => setErrors([]),
  };
}

/** A new password and its confirmation. `mismatch()` is a `useSubmit`
 *  precheck: the translated error when the two differ, else null. */
export function useNewPassword() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  return {
    password,
    mismatch: () =>
      password === confirm ? null : t("account.passwordMismatch"),
    reset: () => {
      setPassword("");
      setConfirm("");
    },
    fields: (label: string) => (
      <>
        <TextField
          label={label}
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={setPassword}
        />
        <TextField
          label={t("account.confirmPassword")}
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={setConfirm}
        />
      </>
    ),
  };
}

/** Form-level feedback: error messages (announced) or a success notice. */
export function FormFeedback({
  errors,
  success,
}: {
  errors: string[];
  success?: string | null;
}) {
  if (errors.length > 0)
    return (
      <ul className="form__errors" role="alert">
        {errors.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    );
  return success ? (
    <p className="form__success" role="status">
      {success}
    </p>
  ) : null;
}
