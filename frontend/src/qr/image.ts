/** Image-file helpers shared by the logo upload UI. Framework-agnostic. */

/** The image MIME types the logo upload accepts. */
export const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
] as const;

/** True when `file` is one of the image types the logo upload accepts. */
export function isSupportedImage(file: File): boolean {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type);
}

/** Read a `File` or `Blob` as a data URL (e.g. `data:image/png;base64,…`). */
export function fileToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
