import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspaceId: (id: string) => void;
  createWorkspace: (name: string) => Promise<Workspace>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  activeWorkspace: null,
  setActiveWorkspaceId: () => {},
  createWorkspace: async () => ({ id: "", name: "", owner_id: "", created_at: "" }),
  renameWorkspace: async () => {},
  deleteWorkspace: async () => {},
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

  const setActiveWorkspaceId = (id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_WS_KEY, id);
  };

  const createWorkspace = async (name: string): Promise<Workspace> => {
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("workspaces")
      .insert({ name, owner_id: user.id })
      .select()
      .single();
    if (error) throw error;

    // Add user as owner member
    await supabase.from("workspace_members").insert({
      workspace_id: data.id,
      user_id: user.id,
      role: "owner",
    });

    const ws = data as Workspace;
    setWorkspaces(prev => [...prev, ws]);
    setActiveWorkspaceId(ws.id);
    return ws;
  };

  const renameWorkspace = async (id: string, name: string) => {
    const { error } = await supabase
      .from("workspaces")
      .update({ name })
      .eq("id", id);
    if (error) throw error;
    setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name } : w));
  };

  const deleteWorkspace = async (id: string) => {
    if (workspaces.length <= 1) throw new Error("Não é possível excluir o único workspace");
    const { error } = await supabase.from("workspaces").delete().eq("id", id);
    if (error) throw error;
    setWorkspaces(prev => {
      const remaining = prev.filter(w => w.id !== id);
      if (activeId === id && remaining.length > 0) {
        setActiveWorkspaceId(remaining[0].id);
      }
      return remaining;
    });
  };

  const activeWorkspace = workspaces.find(w => w.id === activeId) || null;

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      activeWorkspace,
      setActiveWorkspaceId,
      createWorkspace,
      renameWorkspace,
      deleteWorkspace,
      loading,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
};
