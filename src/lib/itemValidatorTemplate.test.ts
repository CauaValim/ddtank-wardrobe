import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractTemplatePairs } from "./itemValidatorTemplate";

const file = path.resolve(__dirname, "eventTemplate/__fixtures__/template.xlsx");

describe.skipIf(!existsSync(file))("Verificar Itens no modelo oficial", () => {
  it("separa cada item do Faça se Puder com o ID certo", async () => {
    const b = readFileSync(file);
    const ab = new ArrayBuffer(b.byteLength);
    new Uint8Array(ab).set(b);
    const { pairs, otherSheets } = await extractTemplatePairs(ab);
    const doit = pairs.filter((p) => p.sheet === "BR-Do it if you can s1-s401");
    expect(doit).toHaveLength(18);
    expect(doit.slice(0, 2)).toEqual([
      { sheet: "BR-Do it if you can s1-s401", cell: "B30", id: "46252", name: "3 anos soldado (90 Days)" },
      { sheet: "BR-Do it if you can s1-s401", cell: "B33", id: "12240", name: "Pedra fundida" },
    ]);
    // Itens exigidos do Faça se Puder também entram.
    expect(pairs.some((p) => p.sheet === "BR - Do it if you can s1-s401" && p.name === "Prêmio da Guilda" && p.id === "11314")).toBe(true);
    expect(otherSheets).toContain("BR-Transformation s1-s402");
  }, 120000);
});
