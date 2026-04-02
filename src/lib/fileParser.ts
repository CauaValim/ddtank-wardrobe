import * as XLSX from "@e965/xlsx";
import JSZip from "jszip";
import type { GameItem } from "@/types/item";

export interface ImportedImage {
  blob: Blob;
  previewUrl: string;
}

function findField(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] != null) return row[k];
  }
  return undefined;
}

const ID_KEYS = ["ID", "id", "Id", "iD"];
const NAME_KEYS = ["Nome", "nome", "name", "Name"];
const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

function getImageMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MIME_TYPES[ext] ?? "application/octet-stream";
}

function parseRows(rows: Record<string, unknown>[]): GameItem[] {
  return rows
    .filter((row) => findField(row, ...ID_KEYS) != null)
    .map((row) => {
      const id = String(findField(row, ...ID_KEYS));
      const rawName = findField(row, ...NAME_KEYS);
      const name = rawName != null ? String(rawName) : `Item #${id}`;
      const skipKeys = new Set([...ID_KEYS, ...NAME_KEYS]);
      const attributes: Record<string, string> = {};
      Object.entries(row).forEach(([key, val]) => {
        if (!skipKeys.has(key) && val != null && String(val).length < 200) {
          attributes[key] = String(val);
        }
      });
      return { id, name, attributes };
    });
}

export async function parseJson(file: File): Promise<GameItem[]> {
  const text = await file.text();
  const sanitized = text.replace(/\bNaN\b/g, "null");
  const data = JSON.parse(sanitized);
  const rows: Record<string, unknown>[] = Array.isArray(data) ? data : [];
  return parseRows(rows);
}

export async function parseExcel(file: File): Promise<GameItem[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  return parseRows(rows);
}

export async function parseZipImages(
  file: File
): Promise<Map<string, ImportedImage>> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const imageMap = new Map<string, ImportedImage>();

  const entries = Object.entries(zip.files).filter(
    ([name, f]) =>
      !f.dir && /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)
  );

  await Promise.all(
    entries.map(async ([name, zipEntry]) => {
      const bytes = await zipEntry.async("uint8array");
      const blob = new Blob([bytes], { type: getImageMimeType(name) });
      const previewUrl = URL.createObjectURL(blob);
      const basename = name.split("/").pop()?.replace(/\.[^.]+$/, "").trim() ?? "";

      if (basename) {
        imageMap.set(basename, { blob, previewUrl });
      }
    })
  );

  return imageMap;
}
