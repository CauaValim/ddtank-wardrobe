import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Lock, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERMISSION_GROUPS, type Permission } from "@/lib/permissions";
import { ROLE_COLORS, canManageRole, type Viewer } from "@/lib/roles";
import type { PanelRole, RolesApi } from "@/hooks/useRoles";

async function attempt(op: () => Promise<unknown>, done?: string) {
  try {
    await op();
    if (done) toast.success(done);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

interface Props {
  api: RolesApi;
  users: { id: string; email: string }[];
  viewer: Viewer;
}

/** Aba "Cargos": lista em ordem de hierarquia e o editor do cargo escolhido (exibição, permissões, membros). */
export function RolesPanel({ api, users, viewer }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const role = api.roles.find((r) => r.id === selected) ?? null;
  const canEditRoles = viewer.can("roles.manage");

  useEffect(() => {
    if (!selected && api.roles.length) setSelected(api.roles[0].id);
  }, [api.roles, selected]);

  const create = () => attempt(async () => {
    const r = await api.createRole("novo cargo");
    setSelected(r.id);
  }, "Cargo criado");

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      <div className="space-y-1">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cargos — {api.roles.length}</span>
          {canEditRoles && (
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Criar cargo" onClick={create}><Plus className="h-4 w-4" /></Button>
          )}
        </div>
        <p className="px-1 pb-1 text-[11px] text-muted-foreground">Cargos mais acima na lista têm prioridade. Você só altera os que estão abaixo do seu cargo mais alto.</p>
        {api.roles.map((r, i) => {
          const manageable = canEditRoles && canManageRole(viewer, r);
          return (
            <div
              key={r.id}
              className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${r.id === selected ? "bg-muted" : "hover:bg-muted/60"}`}
            >
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setSelected(r.id)}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="truncate font-medium" style={{ color: r.color }}>{r.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{api.membersOf.get(r.id)?.length ?? 0}</span>
                {!manageable && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
              </button>
              {manageable && (
                <span className="hidden shrink-0 group-hover:flex">
                  <button type="button" className="rounded p-0.5 hover:bg-background disabled:opacity-30" title="Subir" disabled={i === 0 || !canManageRole(viewer, api.roles[i - 1])}
                    onClick={() => attempt(() => api.moveRole(r.id, -1))}><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" className="rounded p-0.5 hover:bg-background disabled:opacity-30" title="Descer" disabled={i === api.roles.length - 1}
                    onClick={() => attempt(() => api.moveRole(r.id, 1))}><ArrowDown className="h-3.5 w-3.5" /></button>
                </span>
              )}
            </div>
          );
        })}
        {api.roles.length === 0 && !api.loading && <p className="px-1 text-sm text-muted-foreground">Nenhum cargo ainda.</p>}
      </div>

      {role ? (
        <RoleEditor key={role.id} api={api} role={role} users={users} viewer={viewer} onDeleted={() => setSelected(null)} />
      ) : (
        <p className="text-sm text-muted-foreground">Escolha um cargo na lista.</p>
      )}
    </div>
  );
}

function RoleEditor({ api, role, users, viewer, onDeleted }: { api: RolesApi; role: PanelRole; users: Props["users"]; viewer: Viewer; onDeleted: () => void }) {
  const editable = viewer.can("roles.manage") && canManageRole(viewer, role);
  const canAssign = viewer.can("users.manage") && canManageRole(viewer, role);
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [perms, setPerms] = useState<Set<string>>(new Set(role.permissions));
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState("");
  const dirty = name !== role.name || color !== role.color || perms.size !== role.permissions.length || role.permissions.some((p) => !perms.has(p));
  const members = api.membersOf.get(role.id) ?? [];
  const emailOf = (id: string) => users.find((u) => u.id === id)?.email ?? id.slice(0, 8);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Dê um nome ao cargo");
      return;
    }
    setBusy(true);
    await attempt(() => api.updateRole(role.id, { name: name.trim(), color, permissions: [...perms] }), "Cargo salvo");
    setBusy(false);
  };

  const togglePerm = (p: Permission, on: boolean) => {
    const next = new Set(perms);
    if (on) next.add(p);
    else next.delete(p);
    setPerms(next);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
        <h2 className="text-lg font-semibold" style={{ color }}>{role.name}</h2>
        {!editable && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Este cargo está no seu nível ou acima: só visualização.</span>}
        {editable && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1 text-destructive hover:text-destructive"
            onClick={() => confirm(`Excluir o cargo "${role.name}"? Quem tem só ele perde o acesso dado por ele.`) && attempt(async () => { await api.deleteRole(role.id); onDeleted(); }, "Cargo excluído")}
          >
            <Trash2 className="h-4 w-4" /> Excluir cargo
          </Button>
        )}
      </div>

      <Tabs defaultValue="permissions">
        <TabsList>
          <TabsTrigger value="display">Exibição</TabsTrigger>
          <TabsTrigger value="permissions">Permissões</TabsTrigger>
          <TabsTrigger value="members">Membros ({members.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="display" className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="role-name">Nome do cargo</Label>
            <Input id="role-name" value={name} disabled={!editable} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </div>
          <div className="space-y-1">
            <Label>Cor do cargo</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {ROLE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!editable}
                  title={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded ${color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input type="color" disabled={!editable} value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent" title="Outra cor" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          {PERMISSION_GROUPS.map((g) => (
            <div key={g.label} className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h3>
              {g.permissions.map((p) => {
                // Como no Discord: só se liga em um cargo o que você mesmo tem.
                const allowed = editable && (viewer.can("administrator") || viewer.can(p.key));
                return (
                  <div key={p.key} className="flex items-start justify-between gap-4 border-b border-border/60 py-2">
                    <label htmlFor={`rp-${p.key}`} className="text-sm">
                      <span className="font-medium">{p.label}</span>
                      <span className="block text-xs text-muted-foreground">{p.description}</span>
                    </label>
                    <Switch id={`rp-${p.key}`} checked={perms.has(p.key)} disabled={!allowed} onCheckedChange={(on) => togglePerm(p.key, on)} />
                  </div>
                );
              })}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="members" className="space-y-2">
          {canAssign && (
            <div className="flex gap-2">
              <Select value={adding} onValueChange={setAdding}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Adicionar membro..." /></SelectTrigger>
                <SelectContent>
                  {users.filter((u) => !members.includes(u.id)).map((u) => <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button disabled={!adding} onClick={() => attempt(async () => { await api.assign(adding, role.id); setAdding(""); }, "Cargo dado")}>Adicionar</Button>
            </div>
          )}
          {members.length === 0 && <p className="text-sm text-muted-foreground">Ninguém tem este cargo.</p>}
          {members.map((id) => (
            <div key={id} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
              {emailOf(id)}
              {canAssign && (
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Tirar o cargo" onClick={() => attempt(() => api.unassign(id, role.id), "Cargo removido")}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {editable && dirty && (
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
          <span>Você tem alterações não salvas.</span>
          <span className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setName(role.name); setColor(role.color); setPerms(new Set(role.permissions)); }}>Desfazer</Button>
            <Button size="sm" onClick={save} disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</Button>
          </span>
        </div>
      )}
    </div>
  );
}
