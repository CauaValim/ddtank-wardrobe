import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, PERMISSION_PRESETS, permissionsFromRole } from "./permissions";

const root = path.resolve(__dirname, "../..");

describe("permissões", () => {
  it("a função manage-users aceita exatamente as mesmas permissões do painel", () => {
    const fn = readFileSync(path.join(root, "supabase/functions/manage-users/index.ts"), "utf8");
    const list = /const PERMISSIONS = \[([\s\S]*?)\];/.exec(fn)?.[1] ?? "";
    expect([...list.matchAll(/"([\w.]+)"/g)].map((m) => m[1]).sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("as regras do banco só usam permissões que existem no painel", () => {
    const dir = path.join(root, "supabase/migrations");
    const used = new Set<string>();
    for (const f of readdirSync(dir)) {
      const sql = readFileSync(path.join(dir, f), "utf8");
      for (const m of sql.matchAll(/has_permission\([^,]+,\s*'+([\w.]+)'+\)/g)) used.add(m[1]);
      for (const m of sql.matchAll(/\('(?:super_admin|admin|analista|midia)',\s*'([\w.]+)'\)/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(5);
    for (const p of used) expect(ALL_PERMISSIONS, p).toContain(p);
  });

  it("os modelos e os cargos antigos usam permissões válidas", () => {
    for (const preset of PERMISSION_PRESETS) for (const p of preset.permissions) expect(ALL_PERMISSIONS).toContain(p);
    expect(permissionsFromRole("super_admin")).toEqual(ALL_PERMISSIONS);
    expect(permissionsFromRole("admin")).not.toContain("users.manage");
    expect(permissionsFromRole("user")).toEqual([]);
  });
});
