import type { ImageItem } from "./manual-schema";

/**
 * Downscale a teacher-uploaded image file in the browser (canvas) before it
 * ever enters the manual JSON — keeps the document small and avoids shipping
 * multi-megabyte phone photos through the export APIs. Returns a ready
 * ImageItem with a JPEG data URI.
 */
export async function fileToImageItem(
  file: File,
  maxWidth = 900
): Promise<ImageItem> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode the image."));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxWidth / (img.naturalWidth || maxWidth));
  const width = Math.round((img.naturalWidth || maxWidth) * scale);
  const height = Math.round((img.naturalHeight || maxWidth) * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available in this browser.");
  ctx.drawImage(img, 0, 0, width, height);

  return {
    kind: "image",
    src: canvas.toDataURL("image/jpeg", 0.75),
    caption: "",
    source: "Uploaded",
    width,
    height,
  };
}
