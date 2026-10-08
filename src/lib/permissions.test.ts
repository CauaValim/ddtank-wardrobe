import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, permissionsFromRole } from "./permissions";

const root = path.resolve(__dirname, "../..");

describe("permissões", () => {
  it("as edge functions conhecem exatamente as mesmas permissões do painel", () => {
    const fn = readFileSync(path.join(root, "supabase/functions/_shared/permissions.ts"), "utf8");
    const list = /const PERMISSIONS = \[([\s\S]*?)\];/.exec(fn)?.[1] ?? "";
    expect([...list.matchAll(/"([\w.]+)"/g)].map((m) => m[1]).sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("as regras do banco só usam permissões que existem no painel", () => {
    const dir = path.join(root, "supabase/migrations");
    const used = new Set<string>();
    for (const f of readdirSync(dir)) {
      const sql = readFileSync(path.join(dir, f), "utf8");
      for (const m of sql.matchAll(/has_permission\([^,]+,\s*'+([\w.]+)'+\)/g)) used.add(m[1]);
      // Permissões dos cargos iniciais: ARRAY['items.view_ids', ...]
      for (const arr of sql.matchAll(/ARRAY\[([^\]]*)\]/g)) for (const m of arr[1].matchAll(/'([a-z_]+\.[a-z_.]+|administrator)'/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(5);
    for (const p of used) expect(ALL_PERMISSIONS, p).toContain(p);
  });

  it("os cargos antigos viram permissões válidas", () => {
    expect(permissionsFromRole("super_admin")).toEqual(["administrator"]);
    expect(permissionsFromRole("admin")).not.toContain("users.manage");
    expect(permissionsFromRole("user")).toEqual([]);
  });
});
