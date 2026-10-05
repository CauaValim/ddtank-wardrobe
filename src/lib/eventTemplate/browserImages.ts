import type { ImageData } from "./drawing";

const MAX_SIDE = 128;

async function toPng(blob: Blob, maxSide = MAX_SIDE): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!png) throw new Error("Falha ao gerar PNG");
  return { data: new Uint8Array(await png.arrayBuffer()), width, height };
}

/** Downloads an image (URL or data URL) and converts it to a small PNG for the workbook. */
export async function loadImageForWorkbook(url: string): Promise<ImageData | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await toPng(await response.blob());
  } catch {
    return null;
  }
}

/** Reads an image chosen by the user as a small PNG data URL (stored inside the document). */
export async function fileToItemImage(file: File): Promise<string> {
  const png = await toPng(file);
  let binary = "";
  png.data.forEach((b) => (binary += String.fromCharCode(b)));
  return `data:image/png;base64,${btoa(binary)}`;
}

export function downloadBlob(data: ArrayBuffer, fileName: string) {
  const url = URL.createObjectURL(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Firefox/Safari still need the URL for a moment after the click.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
