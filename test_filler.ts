import { JSDOM } from "jsdom";
const dom = new JSDOM();
(globalThis as any).DOMParser = dom.window.DOMParser;
(globalThis as any).XMLSerializer = dom.window.XMLSerializer;
(globalThis as any).Node = dom.window.Node;

import * as XLSX from "@e965/xlsx";
import { buildNameIndex, fillIds } from "./src/lib/idFiller";
import * as fs from "fs";

const buf = fs.readFileSync("/mnt/user-uploads/BR_Pokemon_week_s1-s400.xlsx");
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const items = [
  { id: 10, name: "Poção de Fortalecimento Nv.3" },
  { id: 14654, name: "Figurino Ilustrado Elite" },
  { id: 40012, name: "Poção de Concentração Nv.3" },
  { id: 30, name: "Pedra de Ascensão Divina" },
  { id: 12335, name: "Fragmento de Marca da Alma Excelente" },
  { id: 123180, name: "Runa excelente de posição aleatória" },
];
const idx = buildNameIndex(items);

fillIds(ab, idx).then((result) => {
  const wb = XLSX.read(new Uint8Array(result.outputBuffer), { type: "array" });
  const ws = wb.Sheets["BR-Consume s1-s398"];
  for (const ref of ["D5","D8","D11","D14","D17","D20"]) {
    console.log(ref, "=>", JSON.stringify(ws[ref]?.v));
  }
  console.log("errors:", result.errors.length, "filled:", result.filled);
});
