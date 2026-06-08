import { useState, useEffect, useCallback } from "react";
import { Building2, Plus, Pencil, Trash2, Check, X, Crown, RotateCcw, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { WorkspaceMembers } from "@/components/settings/WorkspaceMembers";

const Workspaces = () => {
  const {
    workspaces,
    activeWorkspace,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    restoreWorkspace,
    purgeWorkspace,
    listTrashedWorkspaces,
    setWorkspaceAiEnabled,
  } = useWorkspace();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();

  type TrashedWorkspace = { id: string; name: string; owner_id: string; created_at: string; deleted_at?: string | null };
  const [trashed, setTrashed] = useState<TrashedWorkspace[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashedWorkspace | null>(null);
  const [purgeConfirmText, setPurgeConfirmText] = useState("");
  const [purging, setPurging] = useState(false);

  const RETENTION_DAYS = 30;
  const daysLeft = (deletedAt?: string | null) => {
    if (!deletedAt) return RETENTION_DAYS;
    const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86_400_000;
    return Math.max(0, Math.ceil(RETENTION_DAYS - elapsed));
  };

  const refreshTrash = useCallback(async () => {
    try {
      setTrashed(await listTrashedWorkspaces());
    } catch (err) {
      console.error("Erro ao carregar lixeira:", err);
    }
  }, [listTrashedWorkspaces]);

  useEffect(() => {
    refreshTrash();
  }, [refreshTrash]);

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      await restoreWorkspace(id);
      toast.success("Conta restaurada!");
      await refreshTrash();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao restaurar");
    } finally {
      setRestoringId(null);
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    setPurging(true);
    try {
      await purgeWorkspace(purgeTarget.id);
      toast.success("Conta excluída definitivamente");
      setPurgeTarget(null);
      setPurgeConfirmText("");
      await refreshTrash();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    } finally {
      setPurging(false);
    }
  };

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [togglingAiId, setTogglingAiId] = useState<string | null>(null);

  const handleToggleAi = async (id: string, current: boolean) => {
    setTogglingAiId(id);
    try {
      await setWorkspaceAiEnabled(id, !current);
      toast.success(!current ? "Análises de IA ativadas" : "Análises de IA desativadas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    } finally {
      setTogglingAiId(null);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createWorkspace(newName.trim());
      toast.success(`Conta "${newName.trim()}" criada!`);
      setNewName("");
      setShowCreate(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar conta");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    setRenaming(true);
    try {
      await renameWorkspace(id, editName.trim());
      toast.success("Conta renomeada!");
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao renomear");
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteWorkspace(deleteId);
      toast.success("Conta movida para a lixeira", {
        description: `Pode ser restaurada por ${RETENTION_DAYS} dias.`,
      });
      setDeleteId(null);
      await refreshTrash();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  };

  const wsToDelete = workspaces.find(w => w.id === deleteId);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workspace</h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? "Gerencie seus workspaces e os membros de cada um. Cada workspace tem dados e integrações isolados."
              : "Gerencie seus workspaces e membros. Apenas administradores podem criar novos workspaces."}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" /> Nova conta
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {workspaces.map((ws, idx) => {
          const isActive = ws.id === activeWorkspace?.id;
          const isOwner = ws.owner_id === user?.id;
          const isEditing = editingId === ws.id;
          const isOnly = workspaces.length <= 1;

          return (
            <motion.div
              key={ws.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="glass-card p-4 space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <Input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(ws.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      disabled={renaming}
                    />
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground truncate">{ws.name}</span>
                      {isActive && <Badge variant="default" className="text-xs">Ativa</Badge>}
                      {isOwner && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Crown className="w-3 h-3" /> Proprietário
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isEditing ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => saveEdit(ws.id)}
                        disabled={renaming || !editName.trim()}
                      >
                        <Check className="w-4 h-4 text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={cancelEdit} disabled={renaming}>
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(ws.id, ws.name)}
                        disabled={!isOwner}
                        title={isOwner ? "Renomear" : "Apenas o proprietário pode renomear"}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteId(ws.id)}
                        disabled={!isOwner || isOnly}
                        title={
                          !isOwner
                            ? "Apenas o proprietário pode excluir"
                            : isOnly
                            ? "Não é possível excluir a única conta"
                            : "Excluir"
                        }
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {isAdmin && !isEditing && (
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">Análises de IA</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {ws.ai_analysis_enabled
                          ? "O co-piloto analisa conversas e gera sugestões."
                          : "Conversas são recebidas, mas a IA não gera sugestões."}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={ws.ai_analysis_enabled}
                    disabled={togglingAiId === ws.id}
                    onCheckedChange={() => handleToggleAi(ws.id, ws.ai_analysis_enabled)}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Membros do workspace ativo */}
      {activeWorkspace && (
        <WorkspaceMembers
          key={activeWorkspace.id}
          workspaceId={activeWorkspace.id}
          canManage={activeWorkspace.owner_id === user?.id || isAdmin}
        />
      )}

      {/* Lixeira */}
      {trashed.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Lixeira</h2>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            Contas excluídas ficam aqui por {RETENTION_DAYS} dias e depois são removidas
            definitivamente. Restaure antes do prazo para recuperar todos os dados.
          </p>
          {trashed.map((ws) => {
            const left = daysLeft(ws.deleted_at);
            const isOwner = ws.owner_id === user?.id;
            return (
              <div
                key={ws.id}
                className="glass-card p-4 flex items-center gap-3 opacity-80"
              >
                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-muted-foreground truncate line-through">
                      {ws.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {left > 0 ? `Some em ${left} dia${left === 1 ? "" : "s"}` : "Será removida em breve"}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRestore(ws.id)}
                  disabled={!isOwner || restoringId === ws.id}
                  title={isOwner ? "Restaurar" : "Apenas o proprietário pode restaurar"}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  {restoringId === ws.id ? "Restaurando..." : "Restaurar"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => { setPurgeTarget(ws); setPurgeConfirmText(""); }}
                  disabled={!isOwner}
                  title={isOwner ? "Excluir definitivamente" : "Apenas o proprietário pode excluir"}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir de vez
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Create */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar nova conta</DialogTitle>
            <DialogDescription>
              Cada conta possui suas próprias integrações, conversas e configurações.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da conta</Label>
              <Input
                autoFocus
                placeholder="Ex: Empresa X, Vendedor 2..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? "Criando..." : "Criar conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover conta "{wsToDelete?.name}" para a lixeira?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta e todos os seus dados (conversas, integrações, sugestões e configurações) vão
              para a <strong>lixeira</strong> e deixam de aparecer no app. Você pode
              <strong> restaurá-la nos próximos {RETENTION_DAYS} dias</strong>; depois disso ela é
              excluída definitivamente.
              <br /><br />
              <strong>Importante:</strong> as conversas no WhatsApp e os dados no seu CRM não serão afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Movendo..." : "Mover para a lixeira"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Purge (hard delete) confirmation */}
      <AlertDialog
        open={!!purgeTarget}
        onOpenChange={(open) => { if (!open) { setPurgeTarget(null); setPurgeConfirmText(""); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Excluir "{purgeTarget?.name}" definitivamente?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é <strong>irreversível</strong>. Todos os dados desta conta
              (conversas, mensagens, sugestões, integrações e configurações) serão
              <strong> apagados permanentemente</strong> e não poderão ser restaurados.
              <br /><br />
              Para confirmar, digite o nome da conta: <strong>{purgeTarget?.name}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={purgeConfirmText}
            onChange={(e) => setPurgeConfirmText(e.target.value)}
            placeholder={purgeTarget?.name}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purging}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handlePurge();
              }}
              disabled={purging || purgeConfirmText.trim() !== (purgeTarget?.name ?? "")}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {purging ? "Excluindo..." : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Workspaces;
