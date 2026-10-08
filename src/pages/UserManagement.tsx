import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, Plus, Shield, Trash2, UserCog, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { RolesPanel } from "@/components/roles/RolesPanel";
import { canManageRole, type Viewer } from "@/lib/roles";

interface ManagedUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
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

export default function UserManagement() {
  const auth = useAuth();
  const roles = useRoles();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRoles, setNewRoles] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const viewer: Viewer = { can: auth.can, topPosition: auth.topPosition };
  const canUsers = auth.can("users.manage");
  const me = auth.user?.id ?? null;

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
  }, [fetchUsers]);

  const run = async (op: () => Promise<unknown>, done?: string) => {
    try {
      await op();
      if (done) toast({ title: done });
      // O próprio acesso pode ter mudado.
      if (me) auth.reloadPermissions(me);
    } catch (e) {
      toast({ title: "Erro", description: errorMessage(e), variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!newEmail || !newPassword) return;
    setSaving(true);
    try {
      await callManageUsers("create-user", "POST", { email: newEmail, password: newPassword, role_ids: [...newRoles] });
      toast({ title: "Usuário criado com sucesso" });
      setCreateOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewRoles(new Set());
      await Promise.all([fetchUsers(), roles.reload()]);
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
      await Promise.all([fetchUsers(), roles.reload()]);
    } catch (e) {
      toast({ title: "Erro", description: errorMessage(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /** Cargo mais alto do usuário (para saber se quem vê pode removê-lo). */
  const topOf = (userId: string) => Math.max(-1, ...roles.rolesOf(userId).map((r) => r.position));
  const isAdminUser = (userId: string) => roles.rolesOf(userId).some((r) => r.permissions.includes("administrator"));
  const canRemoveUser = (u: ManagedUser) =>
    canUsers && u.id !== me && (auth.can("administrator") || (!isAdminUser(u.id) && topOf(u.id) < auth.topPosition));
  const assignable = roles.roles.filter((r) => canManageRole(viewer, r));

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
              <h1 className="text-lg font-bold text-foreground">Usuários e cargos</h1>
            </div>
          </div>
          {canUsers && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Novo Usuário
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">Membros ({users.length})</TabsTrigger>
            <TabsTrigger value="roles">Cargos ({roles.roles.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <p className="mb-3 text-sm text-muted-foreground">
              O acesso de cada pessoa é a soma das permissões dos cargos dela. Você só dá ou tira cargos abaixo do seu cargo mais alto.
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
                      <TableHead>Cargos</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => {
                      const mine = roles.rolesOf(u.id);
                      const addable = canUsers ? assignable.filter((r) => !mine.some((m) => m.id === r.id)) : [];
                      return (
                        <TableRow key={u.id}>
                          <TableCell>
                            <p className="text-sm font-medium text-foreground">{u.email}{u.id === me && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}</p>
                            <p className="text-xs text-muted-foreground">
                              {u.last_sign_in_at ? `Último acesso em ${new Date(u.last_sign_in_at).toLocaleDateString("pt-BR")}` : "Nunca entrou"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1">
                              {mine.map((r) => (
                                <span key={r.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                                  {r.name}
                                  {canUsers && canManageRole(viewer, r) && (
                                    <button type="button" title="Tirar o cargo" className="rounded-full hover:text-destructive" onClick={() => run(() => roles.unassign(u.id, r.id), "Cargo removido")}>
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </span>
                              ))}
                              {mine.length === 0 && <span className="text-xs text-muted-foreground">Sem cargo (só consulta de itens)</span>}
                              {addable.length > 0 && (
                                <Select value="" onValueChange={(roleId) => run(() => roles.assign(u.id, roleId), "Cargo dado")}>
                                  <SelectTrigger className="h-6 w-auto gap-1 rounded-full px-2 text-xs" title="Dar cargo"><Plus className="h-3 w-3" /></SelectTrigger>
                                  <SelectContent>
                                    {addable.map((r) => (
                                      <SelectItem key={r.id} value={r.id}>
                                        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />{r.name}</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {canRemoveUser(u) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                title="Remover usuário"
                                onClick={() => setDeleteTarget(u)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="roles">
            <RolesPanel api={roles} users={users} viewer={viewer} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Novo usuário */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>Crie a conta e escolha os cargos dela.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="nu-email">Email</label>
              <Input id="nu-email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="nu-pass">Senha</label>
              <Input id="nu-pass" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Cargos</p>
              {assignable.length === 0 && <p className="text-xs text-muted-foreground">Não há cargos abaixo do seu para dar.</p>}
              {assignable.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={newRoles.has(r.id)}
                    onCheckedChange={(c) => setNewRoles((prev) => {
                      const next = new Set(prev);
                      if (c === true) next.add(r.id);
                      else next.delete(r.id);
                      return next;
                    })}
                  />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                  {r.name}
                </label>
              ))}
            </div>
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
