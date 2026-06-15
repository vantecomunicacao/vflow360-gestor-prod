import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AssistantThread {
  id: string;
  title: string | null;
  updated_at: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  refs: { tools_used?: string[] } | null;
  created_at: string;
}

// Lista de conversas (threads) do usuário no workspace. RLS garante só as dele.
export function useAssistantThreads(workspaceId: string | null | undefined) {
  return useQuery<AssistantThread[], Error>({
    queryKey: ["assistant-threads", workspaceId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("ai_assistant_threads" as any) as any)
        .select("id, title, updated_at")
        .eq("workspace_id", workspaceId as string)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []) as AssistantThread[];
    },
    enabled: !!workspaceId,
  });
}

// Mensagens de um thread.
export function useAssistantMessages(threadId: string | null) {
  return useQuery<AssistantMessage[], Error>({
    queryKey: ["assistant-messages", threadId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("ai_assistant_messages" as any) as any)
        .select("id, role, content, refs, created_at")
        .eq("thread_id", threadId as string)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data || []) as AssistantMessage[];
    },
    enabled: !!threadId,
  });
}

// Envia uma pergunta. Cria thread se threadId for null. Retorna o thread_id usado.
export function useSendAssistantMessage(workspaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation<{ thread_id: string; answer: string }, Error, { threadId: string | null; question: string }>({
    mutationFn: async ({ threadId, question }) => {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { workspace_id: workspaceId, thread_id: threadId ?? undefined, question },
      });
      if (error) throw new Error(error.message);
      const err = (data as { error?: string } | null)?.error;
      if (err) throw new Error(err);
      return (data as { data: { thread_id: string; answer: string } }).data;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["assistant-threads", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["assistant-messages", res.thread_id] });
    },
  });
}
