import { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquare, Search, Link2, Phone, Sparkles, Loader2, Trash2, RefreshCw, Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useConversations, useMessages, type Conversation } from "@/hooks/use-conversations";
import { useQueryClient } from "@tanstack/react-query";

interface Message {
  id: string;
  content: string;
  direction: string;
  created_at: string;
}

const Conversations = () => {
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [search, setSearch] = useState("");
  const [integrationFilter, setIntegrationFilter] = useState<string>("all");
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  
  const { data: conversations = [], isLoading: loading } = useConversations();
  const { data: messages = [] } = useMessages(selected?.id ?? null);

  // Auto-select first conversation when data loads
  useEffect(() => {
    if (!selected && conversations.length > 0) {
      setSelected(conversations[0]);
    }
  }, [conversations]);

  // Reset selection when workspace changes
  useEffect(() => {
    setSelected(null);
  }, [activeWorkspace?.id]);

  const handleDelete = async (conversation: Conversation) => {
    if (!confirm(`Tem certeza que deseja apagar a conversa com ${conversation.contact_name || conversation.contact_phone}? Todas as mensagens e sugestões serão removidas.`)) return;

    try {
      // Delete messages, suggestions, then conversation
      await supabase.from("messages").delete().eq("conversation_id", conversation.id);
      await supabase.from("suggestions").delete().eq("conversation_id", conversation.id);
      const { error } = await supabase.from("conversations").delete().eq("id", conversation.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["conversations", activeWorkspace?.id] });
      if (selected?.id === conversation.id) {
        setSelected(null);
      }
      toast({ title: "Conversa apagada com sucesso" });
    } catch (error) {
      toast({ title: "Erro ao apagar conversa", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    }
  };

  const handlePdfUpload = async (file: File) => {
    if (!selected) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Apenas arquivos PDF são suportados", variant: "destructive" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "PDF muito grande",
        description: "O limite é de 10 MB. Reduza o arquivo e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    setUploadingPdf(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      // Upload to storage (under user_id folder)
      const userId = session.user.id;
      const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("whatsapp-media")
        .upload(path, file, { contentType: "application/pdf" });
      if (upErr) throw upErr;

      // Convert to base64 for extraction
      const arrayBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const base64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke("pdf-extract", {
        body: { pdf_base64: base64, file_name: file.name, user_id: userId },
      });
      if (error) throw error;

      const messageContent = data?.message || `📄 [PDF]: ${file.name}`;

      const { error: msgErr } = await supabase.from("messages").insert({
        conversation_id: selected.id,
        direction: "inbound",
        content: messageContent,
        media_url: path,
      });
      if (msgErr) throw msgErr;

      await supabase
        .from("conversations")
        .update({
          last_message: messageContent.slice(0, 100),
          last_message_at: new Date().toISOString(),
        })
        .eq("id", selected.id);

      queryClient.invalidateQueries({ queryKey: ["messages", selected.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations", activeWorkspace?.id] });

      toast({ title: "PDF processado", description: data?.summary ? "Resumo gerado pela IA." : "Arquivo registrado." });
    } catch (err) {
      toast({
        title: "Erro ao processar PDF",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setUploadingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAnalyze = async () => {
    if (!selected) return;
    setAnalyzing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ conversation_id: selected.id }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      const count = result.data?.suggestions?.length || 0;
      toast({
        title: count > 0 ? `${count} sugestão(ões) gerada(s)!` : "Nenhuma sugestão gerada",
        description: count > 0 ? "Veja na página de Sugestões da IA." : "A IA não encontrou ações relevantes nesta conversa.",
      });
    } catch (error) {
      toast({
        title: "Erro na análise",
        description: error instanceof Error ? error.message : "Erro ao analisar conversa",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // Lista de instâncias (números conectados) com base nas conversas atuais do workspace
  const integrationOptions = Array.from(
    new Set(
      conversations
        .map((c) => c.integration_label || (c.integration_type === "stevo" ? "Stevo" : c.integration_type === "uazap" ? "Uazap" : null))
        .filter((v): v is string => !!v)
    )
  ).sort((a, b) => a.localeCompare(b));

  const matchesIntegration = (c: Conversation) => {
    if (integrationFilter === "all") return true;
    const label = c.integration_label || (c.integration_type === "stevo" ? "Stevo" : c.integration_type === "uazap" ? "Uazap" : null);
    return label === integrationFilter;
  };

  const filtered = conversations.filter(c =>
    matchesIntegration(c) &&
    ((c.contact_name || "").toLowerCase().includes(search.toLowerCase()) ||
     (c.contact_phone || "").includes(search))
  );

  // Reset seleção se a conversa selecionada não pertencer à instância filtrada
  useEffect(() => {
    if (selected && !matchesIntegration(selected)) setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationFilter]);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "agora";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString("pt-BR");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-foreground">Conversas</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["conversations", activeWorkspace?.id] });
            if (selected) {
              queryClient.invalidateQueries({ queryKey: ["messages", selected.id] });
            }
            toast({ title: "Conversas atualizadas" });
          }}
        >
          <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
        </Button>
      </div>
      <p className="text-muted-foreground mb-6">Mensagens recebidas do WhatsApp</p>

      <div className="flex gap-4 h-[calc(100%-4rem)]">
        {/* Contact List */}
        <div className="w-80 shrink-0 glass-card flex flex-col">
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar contato..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {integrationOptions.length > 0 && (
              <Select value={integrationFilter} onValueChange={setIntegrationFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos os números" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os números</SelectItem>
                  {integrationOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nenhuma conversa encontrada
              </div>
            ) : (
              filtered.map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => setSelected(contact)}
                  className={`flex items-center gap-3 p-4 cursor-pointer transition-colors border-b border-border/50 ${
                    selected?.id === contact.id ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                    {(contact.contact_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{contact.contact_name || contact.contact_phone}</span>
                      {contact.integration_label && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                          {contact.integration_label}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{contact.last_message}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">{formatTime(contact.last_message_at)}</span>
                    {contact.unread_count > 0 && (
                      <Badge className="text-[10px] px-1.5 py-0 h-4">{contact.unread_count}</Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat View */}
        {selected ? (
          <div className="flex-1 glass-card flex flex-col">
            <div className="p-4 border-b border-border flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                {(selected.contact_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <div>
                <p className="font-medium text-foreground">{selected.contact_name || selected.contact_phone}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {selected.contact_phone}
                  </p>
                  {selected.integration_label && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                      {selected.integration_label}
                    </Badge>
                  )}
                  {!selected.integration_label && selected.integration_type && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                      {selected.integration_type === "stevo" ? "Stevo" : "Uazap"}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePdfUpload(file);
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPdf}
                  title="Enviar PDF (até 10 MB)"
                >
                  {uploadingPdf ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Processando...</>
                  ) : (
                    <><Paperclip className="w-4 h-4 mr-1" /> PDF</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Analisando...</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-1" /> Analisar com IA</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(selected)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Nenhuma mensagem nesta conversa
                </div>
              ) : (
                messages.map((msg, i) => {
                  const msgDate = new Date(msg.created_at).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
                  const prevDate = i > 0 ? new Date(messages[i - 1].created_at).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : null;
                  const showDateSeparator = i === 0 || msgDate !== prevDate;

                  return (
                    <div key={msg.id}>
                      {showDateSeparator && (
                        <div className="flex items-center justify-center my-4">
                          <div className="bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full capitalize">
                            {msgDate}
                          </div>
                        </div>
                      )}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                      >
                        <div className={`max-w-[70%] rounded-xl px-4 py-2.5 ${
                          msg.direction === "outbound"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}>
                          <p className="text-sm">{msg.content}</p>
                          <p className={`text-xs mt-1 ${msg.direction === "outbound" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                            {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </motion.div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 glass-card flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-4" />
              <p>Selecione uma conversa para visualizar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Conversations;
