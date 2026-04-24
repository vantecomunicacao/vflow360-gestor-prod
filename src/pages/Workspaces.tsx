import { useState } from "react";
import { Building2, Plus, Pencil, Trash2, Check, X, Crown } from "lucide-react";
import { motion } from "framer-motion";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

const Workspaces = () => {
  const { workspaces, activeWorkspace, createWorkspace, renameWorkspace, deleteWorkspace } = useWorkspace();
  const { user } = useAuth();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      toast.success("Conta excluída!");
      setDeleteId(null);
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
          <h1 className="text-2xl font-bold text-foreground">Gerenciar Contas</h1>
          <p className="text-muted-foreground">
            Crie, renomeie e exclua suas contas (workspaces). Cada conta tem dados e integrações isolados.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova conta
        </Button>
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
              className="glass-card p-4 flex items-center gap-3"
            >
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
            </motion.div>
          );
        })}
      </div>

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
            <AlertDialogTitle>Excluir conta "{wsToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é <strong>irreversível</strong>. Todas as conversas, integrações, sugestões e
              configurações dessa conta serão removidas permanentemente do sistema.
              <br /><br />
              <strong>Importante:</strong> as conversas no WhatsApp e os dados no GoHighLevel não serão afetados.
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
              {deleting ? "Excluindo..." : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Workspaces;
