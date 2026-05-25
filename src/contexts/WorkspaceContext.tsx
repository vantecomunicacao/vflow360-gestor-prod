import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  deleted_at?: string | null;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspaceId: (id: string) => void;
  createWorkspace: (name: string) => Promise<Workspace>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  restoreWorkspace: (id: string) => Promise<void>;
  listTrashedWorkspaces: () => Promise<Workspace[]>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  activeWorkspace: null,
  setActiveWorkspaceId: () => {},
  createWorkspace: async () => ({ id: "", name: "", owner_id: "", created_at: "" }),
  renameWorkspace: async () => {},
  deleteWorkspace: async () => {},
  restoreWorkspace: async () => {},
  listTrashedWorkspaces: async () => [],
  loading: true,
});

export const useWorkspace = () => useContext(WorkspaceContext);

const ACTIVE_WS_KEY = "copiloto_active_workspace";

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;
      const ws = (data || []) as Workspace[];
      setWorkspaces(ws);

      // Restore or set default active workspace
      const savedId = localStorage.getItem(ACTIVE_WS_KEY);
      if (savedId && ws.find(w => w.id === savedId)) {
        setActiveId(savedId);
      } else if (ws.length > 0) {
        setActiveId(ws[0].id);
        localStorage.setItem(ACTIVE_WS_KEY, ws[0].id);
      }
    } catch (err) {
      console.error("Error fetching workspaces:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_WS_KEY, id);
  }, []);

  const createWorkspace = useCallback(async (name: string): Promise<Workspace> => {
    if (!user) throw new Error("Not authenticated");

    const { data: workspaceId, error: rpcError } = await supabase
      .rpc("create_workspace", { _name: name });

    if (rpcError) throw rpcError;

    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .single();

    if (error) throw error;

    const ws = data as Workspace;
    setWorkspaces(prev => [...prev, ws]);
    setActiveWorkspaceId(ws.id);
    return ws;
  }, [user, setActiveWorkspaceId]);

  const renameWorkspace = useCallback(async (id: string, name: string) => {
    const { error } = await supabase
      .from("workspaces")
      .update({ name })
      .eq("id", id);
    if (error) throw error;
    setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name } : w));
  }, []);

  const deleteWorkspace = useCallback(async (id: string) => {
    if (workspaces.length <= 1) throw new Error("Não é possível excluir o único workspace");
    // Soft delete: vai para a lixeira (expurgo automático em 30 dias via pg_cron).
    const { error } = await supabase
      .from("workspaces")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    setWorkspaces(prev => {
      const remaining = prev.filter(w => w.id !== id);
      if (activeId === id && remaining.length > 0) {
        setActiveWorkspaceId(remaining[0].id);
      }
      return remaining;
    });
  }, [workspaces.length, activeId, setActiveWorkspaceId]);

  const restoreWorkspace = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("workspaces")
      .update({ deleted_at: null })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    const ws = data as Workspace;
    setWorkspaces(prev =>
      prev.some(w => w.id === ws.id)
        ? prev
        : [...prev, ws].sort((a, b) => a.created_at.localeCompare(b.created_at))
    );
  }, []);

  const listTrashedWorkspaces = useCallback(async (): Promise<Workspace[]> => {
    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return (data || []) as Workspace[];
  }, []);

  const activeWorkspace = useMemo(
    () => workspaces.find(w => w.id === activeId) || null,
    [workspaces, activeId]
  );

  const contextValue = useMemo(
    () => ({
      workspaces,
      activeWorkspace,
      setActiveWorkspaceId,
      createWorkspace,
      renameWorkspace,
      deleteWorkspace,
      restoreWorkspace,
      listTrashedWorkspaces,
      loading,
    }),
    [
      workspaces,
      activeWorkspace,
      loading,
      setActiveWorkspaceId,
      createWorkspace,
      renameWorkspace,
      deleteWorkspace,
      restoreWorkspace,
      listTrashedWorkspaces,
    ]
  );

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
};
