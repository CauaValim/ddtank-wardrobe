import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, KeyRound, Loader2, Plus, Shield, Trash2, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { PermissionsEditor } from "@/components/PermissionsEditor";
import { ALL_PERMISSIONS, PERMISSION_GROUPS, isPermission, type Permission } from "@/lib/permissions";

interface ManagedUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  permissions: string[];
}

async function callManageUsers(action: string, method: string, body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users?action=${action}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session?.access_token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };

  const options: RequestInit = { method, headers };
  if (method === "POST" && body) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const r = await fetch(url, options);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Erro desconhecido");
  }
  return r.json();
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Áreas com pelo menos uma função liberada, para o resumo da tabela. */
function summary(perms: Set<Permission>) {
  if (perms.size === ALL_PERMISSIONS.length) return ["Acesso total"];
  return PERMISSION_GROUPS.flatMap((g) => {
    const on = g.permissions.filter((p) => perms.has(p.key)).length;
    return on ? [`${g.label} (${on}/${g.permissions.length})`] : [];
  });
}

export default function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [editPerms, setEditPerms] = useState<Set<Permission>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPerms, setNewPerms] = useState<Set<Permission>>(new Set());
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchUsers = useCallback(async () => {
    try {
      const data: ManagedUser[] = await callManageUsers("list", "GET");
      setUsers([...data].sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")));
    } catch (e) {
      toast({ title: "Erro", description: errorMessage(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, [fetchUsers]);

  const toSet = (list: string[]) => new Set(list.filter(isPermission));

  const openEdit = (u: ManagedUser) => {
    setEditing(u);
    setEditPerms(toSet(u.permissions));
  };

  const handleSavePermissions = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await callManageUsers("set-permissions", "POST", { user_id: editing.id, permissions: [...editPerms] });
      toast({ title: "Acesso atualizado", description: editing.email });
      setEditing(null);
      fetchUsers();
    } catch (e) {
      toast({ title: "Erro", description: errorMessage(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newEmail || !newPassword) return;
    setSaving(true);
    try {
      await callManageUsers("create-user", "POST", { email: newEmail, password: newPassword, permissions: [...newPerms] });
      toast({ title: "Usuário criado com sucesso" });
      setCreateOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewPerms(new Set());
      fetchUsers();
    } catch (e) {
      toast({ title: "Erro", description: errorMessage(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await callManageUsers("delete-user", "POST", { user_id: deleteTarget.id });
      toast({ title: "Usuário removido" });
      setDeleteTarget(null);
      fetchUsers();
    } catch (e) {
      toast({ title: "Erro", description: errorMessage(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="rounded-md p-1.5 hover:bg-muted transition-colors" title="Voltar ao painel">
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <UserCog className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-lg font-bold text-foreground">Gerenciar Usuários</h1>
            </div>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Usuário
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Cada usuário tem acesso só às funções marcadas para ele. Use "Editar acesso" para escolher as funções uma a uma ou preencher com um modelo.
        </p>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Shield className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Email</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const perms = toSet(u.permissions);
                  const parts = summary(perms);
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <p className="text-sm font-medium text-foreground">{u.email}{u.id === me && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}</p>
                        <p className="text-xs text-muted-foreground">
                          {u.last_sign_in_at ? `Último acesso em ${new Date(u.last_sign_in_at).toLocaleDateString("pt-BR")}` : "Nunca entrou"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {parts.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Só consulta de itens</span>
                          ) : (
                            parts.map((p) => <Badge key={p} variant="secondary" className="text-[11px] font-normal">{p}</Badge>)
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => openEdit(u)}>
                          <KeyRound className="h-3.5 w-3.5" /> Editar acesso
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-1 h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Remover usuário"
                          disabled={u.id === me}
                          onClick={() => setDeleteTarget(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      {/* Editar acesso */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Acesso de {editing?.email}</DialogTitle>
            <DialogDescription>Marque as funções do painel que este usuário pode usar.</DialogDescription>
          </DialogHeader>
          <PermissionsEditor value={editPerms} onChange={setEditPerms} locked={editing?.id === me ? ["users.manage"] : []} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSavePermissions} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novo usuário */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>Crie a conta e escolha as funções que ela pode usar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="nu-email">Email</label>
                <Input id="nu-email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@exemplo.com" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="nu-pass">Senha</label>
                <Input id="nu-pass" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
            </div>
            <PermissionsEditor value={newPerms} onChange={setNewPerms} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving || !newEmail || !newPassword}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remover */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              O usuário <strong>{deleteTarget?.email}</strong> será removido permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
