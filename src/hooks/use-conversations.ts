import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface Conversation {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  integration_type: string | null;
  integration_label: string | null;
}

export function useConversations() {
  const { activeWorkspace } = useWorkspace();

  return useQuery({
    queryKey: ["conversations", activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace) return [];
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("workspace_id", activeWorkspace.id)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Conversation[];
    },
    enabled: !!activeWorkspace,
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!conversationId,
  });
}
