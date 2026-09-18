import { ImagePlus, Pencil, Trash2 } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fileToDataUrl,
  isSupportedImage,
  SUPPORTED_IMAGE_TYPES,
} from "../qr/image";
import { ConfirmDialog } from "./Modal";

const ICON = 15;

/** Drag-and-drop logo upload: shows the current logo with change/delete actions,
 *  or an empty dropzone. Dropping a file over an existing logo asks to confirm the
 *  replacement; the explicit "change" action (and an empty drop) apply directly. */
export function LogoField({
  logo,
  onChange,
}: {
  logo: string | null;
  onChange: (logo: string | null) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingLogo, setPendingLogo] = useState<string | null>(null);

  const openPicker = () => inputRef.current?.click();

  const readImage = async (file: File): Promise<string | null> =>
    isSupportedImage(file) ? fileToDataUrl(file) : null;

  // Picking a file is an explicit action, so it always applies directly.
  const onInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again later
    if (!file) return;
    const dataUrl = await readImage(file);
    if (dataUrl) onChange(dataUrl);
  };

  // Dropping over an existing logo asks to confirm the replacement; over an
  // empty zone it imports immediately.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const dataUrl = await readImage(file);
    if (dataUrl) {
      if (logo) setPendingLogo(dataUrl);
      else onChange(dataUrl);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const onDragLeave = () => setIsDragOver(false);

  const dropProps = { onDrop, onDragOver, onDragLeave };
  const className = `logo-dropzone${isDragOver ? " logo-dropzone--dragover" : ""}`;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="logo-dropzone__input"
        accept={SUPPORTED_IMAGE_TYPES.join(",")}
        onChange={onInputChange}
      />
      {logo ? (
        <div className={className} {...dropProps}>
          <img
            className="logo-thumb"
            src={logo}
            alt={t("controls.logoPreview")}
          />
          <div className="logo-dropzone__actions">
            <IconButton label={t("controls.changeLogo")} onClick={openPicker}>
              <Pencil size={ICON} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={t("controls.removeLogo")}
              onClick={() => onChange(null)}
            >
              <Trash2 size={ICON} aria-hidden="true" />
            </IconButton>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={className}
          onClick={openPicker}
          {...dropProps}
        >
          <ImagePlus size={22} aria-hidden="true" />
          <span>{t("controls.logoDropPrompt")}</span>
        </button>
      )}
      <ConfirmDialog
        open={pendingLogo !== null}
        title={t("controls.replaceLogoTitle")}
        message={t("controls.replaceLogoMessage")}
        confirmLabel={t("controls.replace")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (pendingLogo) onChange(pendingLogo);
          setPendingLogo(null);
        }}
        onCancel={() => setPendingLogo(null)}
      />
    </>
  );
}

/** An icon-only button with an accessible label, used for the logo actions. */
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="logo-dropzone__action"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
