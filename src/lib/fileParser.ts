import * as XLSX from "xlsx";
import JSZip from "jszip";
import type { GameItem } from "@/types/item";

export async function parseJson(file: File): Promise<GameItem[]> {
  const text = await file.text();
  const data = JSON.parse(text);
  const rows: Record<string, unknown>[] = Array.isArray(data) ? data : [];

  return rows
    .filter((row) => row["ID"] != null && row["Nome"] != null)
    .map((row) => {
      const id = String(row["ID"]);
      const name = String(row["Nome"]);
      const attributes: Record<string, string> = {};
      Object.entries(row).forEach(([key, val]) => {
        if (key !== "ID" && key !== "Nome" && val != null) {
          attributes[key] = String(val);
        }
      });
      return { id, name, attributes };
    });
}

export async function parseExcel(file: File): Promise<GameItem[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  return rows
    .filter((row) => row["ID"] != null && row["Nome"] != null)
    .map((row) => {
      const id = String(row["ID"]);
      const name = String(row["Nome"]);
      const attributes: Record<string, string> = {};
      Object.entries(row).forEach(([key, val]) => {
        if (key !== "ID" && key !== "Nome" && val != null) {
          attributes[key] = String(val);
        }
      });
      return { id, name, attributes };
    });
}

export async function parseZipImages(
  file: File
): Promise<Map<string, string>> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const imageMap = new Map<string, string>();

  const entries = Object.entries(zip.files).filter(
    ([name, f]) =>
      !f.dir && /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)
  );

  await Promise.all(
    entries.map(async ([name, zipEntry]) => {
      const blob = await zipEntry.async("blob");
      const url = URL.createObjectURL(blob);
      // Extract filename without extension as the ID key
      const basename = name.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
      if (basename) imageMap.set(basename, url);
    })
  );

  return imageMap;
}
