import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

/** A minimal accessible modal dialog: a dimmed backdrop with a centred panel.
 *  Closes on Escape or a backdrop click; focus moves into the panel on open and
 *  is restored to the previously focused element on close. */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal__root">
      {/* A real button so closing on an outside click stays keyboard-reachable
          (Escape and the explicit close button cover keyboard users); hidden
          from assistive tech as it only duplicates the close button. */}
      <button
        type="button"
        className="modal__backdrop"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal__header">
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          <button
            type="button"
            className="modal__close"
            aria-label={t("common.close")}
            title={t("common.close")}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A confirm/cancel dialog built on `Modal`. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p className="modal__message">{message}</p>
      <div className="modal__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="btn" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
