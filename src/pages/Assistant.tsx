import { useEffect, useRef, useState } from "react";
import { Brain, Plus, Send, Loader2, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  useAssistantThreads,
  useAssistantMessages,
  useSendAssistantMessage,
} from "@/hooks/useAssistant";

const SUGGESTIONS = [
  "Como foi a conversão essa semana vs. a semana passada?",
  "Quais funis têm mais leads parados?",
  "Qual vendedor mais converteu este mês?",
  "Tem alguma conversa quente que merece atenção?",
];

export default function Assistant() {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const wsId = activeWorkspace?.id;

  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const { data: threads = [] } = useAssistantThreads(wsId);
  const { data: messages = [], isLoading: loadingMsgs } = useAssistantMessages(threadId);
  const send = useSendAssistantMessage(wsId);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const submit = (text: string) => {
    const q = text.trim();
    if (!q || send.isPending || !wsId) return;
    setInput("");
    setPending(q);
    send.mutate(
      { threadId, question: q },
      {
        onSuccess: (res) => {
          setThreadId(res.thread_id);
          setPending(null);
        },
        onError: (e) => {
          setPending(null);
          setInput(q);
          toast({ title: "Erro ao perguntar", description: e.message, variant: "destructive" });
        },
      },
    );
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  const newChat = () => {
    setThreadId(null);
    setPending(null);
    setInput("");
  };

  const isEmpty = !threadId && messages.length === 0 && !pending;

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      {/* Sidebar de conversas */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col rounded-xl border border-border bg-card">
        <div className="p-3 border-b border-border">
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={newChat}>
            <Plus className="h-4 w-4" /> Nova conversa
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {threads.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">Nenhuma conversa ainda.</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setThreadId(t.id)}
                className={cn(
                  "w-full text-left text-sm px-3 py-2 rounded-lg truncate transition-colors",
                  t.id === threadId ? "bg-accent/15 text-foreground" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {t.title || "Conversa"}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Chat */}
      <main className="flex-1 flex flex-col rounded-xl border border-border bg-card min-w-0">
        <header className="flex items-center gap-2 p-4 border-b border-border">
          <div className="p-2 rounded-lg bg-accent/10">
            <Brain className="h-5 w-5 text-primary-ink" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground leading-tight">Analista IA</h1>
            <p className="text-xs text-muted-foreground">Pergunte sobre seus funis, conversas e resultados.</p>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {isEmpty ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="p-4 rounded-full bg-gradient-to-br from-accent/20 to-primary/20 border border-accent/30">
                <Sparkles className="h-8 w-8 text-primary-ink" />
              </div>
              <p className="text-sm text-muted-foreground max-w-sm">
                Faça uma pergunta em português. Eu busco os números reais dos funis que você configurou e respondo.
              </p>
              <div className="grid sm:grid-cols-2 gap-2 w-full max-w-xl">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="text-left text-xs text-muted-foreground border border-border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {loadingMsgs && threadId && (
                <div className="flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              )}
              {messages.map((m) => (
                <Bubble key={m.id} role={m.role} content={m.content} />
              ))}
              {pending && <Bubble role="user" content={pending} />}
              {send.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="p-1.5 rounded-md bg-accent/10"><Brain className="h-4 w-4 text-primary-ink" /></div>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analisando os dados...
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-3 border-t border-border">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Pergunte ao Analista..."
              rows={1}
              className="resize-none min-h-[44px] max-h-32"
              disabled={send.isPending}
            />
            <Button size="icon" className="h-11 w-11 shrink-0" disabled={send.isPending || !input.trim()} onClick={() => submit(input)}>
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "")}>
      <div className={cn("p-1.5 rounded-md shrink-0 h-fit", isUser ? "bg-primary/10" : "bg-accent/10")}>
        {isUser ? <User className="h-4 w-4 text-primary" /> : <Brain className="h-4 w-4 text-primary-ink" />}
      </div>
      <div
        className={cn(
          "rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap max-w-[80%]",
          isUser ? "bg-primary/10 text-foreground" : "bg-muted/50 text-foreground",
        )}
      >
        {content}
      </div>
    </div>
  );
}
