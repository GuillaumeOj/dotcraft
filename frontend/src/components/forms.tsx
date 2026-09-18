import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessages } from "../auth/errors";

/** Run a form submission: tracks the pending state, collects translated error
 *  messages, and reports success. */
export function useSubmit() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [succeeded, setSucceeded] = useState(false);
  const submit = async (action: () => Promise<unknown>) => {
    setPending(true);
    setErrors([]);
    setSucceeded(false);
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
  return { pending, errors, succeeded, submit, setErrors };
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
