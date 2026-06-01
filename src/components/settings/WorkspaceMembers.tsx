import { useCallback, useEffect, useState } from "react";
import { Users, UserPlus, Trash2, Crown, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Member {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  is_owner: boolean;
}

export function WorkspaceMembers({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_workspace_members", { _workspace_id: workspaceId });
    if (error) toast.error(error.message);
    else setMembers((data || []) as Member[]);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!email.trim()) return;
    setAdding(true);
    const { error } = await supabase.rpc("add_workspace_member", {
      _workspace_id: workspaceId,
      _email: email.trim(),
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Membro adicionado!");
      setEmail("");
      await load();
    }
    setAdding(false);
  };

  const remove = async (m: Member) => {
    setRemovingId(m.user_id);
    const { error } = await supabase.rpc("remove_workspace_member", {
      _workspace_id: workspaceId,
      _user_id: m.user_id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Membro removido");
      await load();
    }
    setRemovingId(null);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-primary" /> Membros
      </h3>

      {canManage && (
        <div className="space-y-2 mb-5">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="email@dapessoa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <Button onClick={add} disabled={adding || !email.trim()}>
              <UserPlus className="w-4 h-4 mr-2" /> {adding ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A pessoa precisa já ter uma conta no sistema (mesmo e-mail do cadastro).
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                {(m.full_name || m.email || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground truncate">{m.full_name || m.email}</span>
                  {m.is_owner && (
                    <Badge variant="secondary" className="text-xs gap-1"><Crown className="w-3 h-3" /> Proprietário</Badge>
                  )}
                </div>
                {m.full_name && <span className="text-xs text-muted-foreground truncate">{m.email}</span>}
              </div>
              {canManage && !m.is_owner && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(m)}
                  disabled={removingId === m.user_id}
                  title="Remover do workspace"
                >
                  {removingId === m.user_id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4 text-destructive" />}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
