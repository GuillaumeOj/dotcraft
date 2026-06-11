function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Encode an SVG string as a data URI. Loaded via <img>, SVG runs in image
 *  mode with scripting disabled, so this is safe even for untrusted markup. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function downloadSvg(svg: string, filename = "qrcode.svg") {
  download(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename);
}

/** Rasterize the SVG to a PNG of `targetPx` width/height and trigger a download. */
export async function downloadPng(
  svg: string,
  targetPx = 1024,
  filename = "qrcode.png",
): Promise<void> {
  const img = new Image();
  const src = svgDataUri(svg);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to render SVG to image."));
    img.src = src;
  });

  const canvas = document.createElement("canvas");
  canvas.width = targetPx;
  canvas.height = targetPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");
  ctx.drawImage(img, 0, 0, targetPx, targetPx);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Failed to encode PNG.");
  download(blob, filename);
}
