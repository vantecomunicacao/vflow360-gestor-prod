import { useState, useEffect, useCallback } from "react";
import { Sparkles, Check, X, MessageSquare, ArrowRight, Filter, Settings2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type SuggestionStatus = "pending" | "approved" | "rejected";

interface Suggestion {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: SuggestionStatus;
  action_data: {
    field?: string;
    value?: string;
    contact_name?: string;
    contact_phone?: string;
  };
  created_at: string;
  conversation_id: string | null;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  mover_funil: "Mover funil",
  campo_personalizado: "Preencher campo",
  adicionar_nota: "Adicionar nota",
  valor_negociacao: "Atualizar valor",
  agendar_lembrete: "Agendar lembrete",
  ganho_perdido: "Marcar resultado",
};

const typeColors: Record<string, string> = {
  mover_funil: "bg-success/10 text-success border-success/20",
  campo_personalizado: "bg-primary/10 text-primary border-primary/20",
  adicionar_nota: "bg-warning/10 text-warning border-warning/20",
  valor_negociacao: "bg-info/10 text-info border-info/20",
  agendar_lembrete: "bg-accent/10 text-accent-foreground border-accent/20",
  ganho_perdido: "bg-destructive/10 text-destructive border-destructive/20",
};

const suggestionTypeOptions = [
  { key: "mover_funil", label: "Mover funil" },
  { key: "campo_personalizado", label: "Preencher campo personalizado" },
  { key: "adicionar_nota", label: "Adicionar nota" },
  { key: "valor_negociacao", label: "Valor da negociação R$" },
  { key: "agendar_lembrete", label: "Agendar lembrete" },
  { key: "ganho_perdido", label: "Marcar como ganho ou perdido" },
];

const Suggestions = () => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SuggestionStatus | "all">("all");
  const [aiConfig, setAiConfig] = useState<Record<string, { enabled: boolean; autoApprove: boolean }>>(
    Object.fromEntries(suggestionTypeOptions.map(o => [o.key, { enabled: true, autoApprove: false }]))
  );
  const [savingConfig, setSavingConfig] = useState(false);
  const { toast } = useToast();

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("suggestions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setSuggestions((data || []) as unknown as Suggestion[]);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAiConfig = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("ai_config")
        .select("action_type, enabled, auto_approve");

      if (data) {
        const config = { ...aiConfig };
        for (const c of data) {
          config[c.action_type] = { enabled: c.enabled, autoApprove: c.auto_approve };
        }
        setAiConfig(config);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchSuggestions();
    fetchAiConfig();
  }, [fetchSuggestions, fetchAiConfig]);

  const toggleEnabled = async (key: string) => {
    const newConfig = { ...aiConfig, [key]: { ...aiConfig[key], enabled: !aiConfig[key].enabled } };
    setAiConfig(newConfig);
    await saveConfigItem(key, newConfig[key]);
  };

  const toggleAutoApprove = async (key: string) => {
    const newConfig = { ...aiConfig, [key]: { ...aiConfig[key], autoApprove: !aiConfig[key].autoApprove } };
    setAiConfig(newConfig);
    await saveConfigItem(key, newConfig[key]);
  };

  const saveConfigItem = async (actionType: string, config: { enabled: boolean; autoApprove: boolean }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("ai_config").upsert(
        { user_id: user.id, action_type: actionType, enabled: config.enabled, auto_approve: config.autoApprove },
        { onConflict: "user_id,action_type" }
      );
    } catch (error) {
      console.error("Error saving ai config:", error);
    }
  };

  const [executingId, setExecutingId] = useState<string | null>(null);
  const [executionResults, setExecutionResults] = useState<Record<string, { opportunityCreated: boolean; message: string }>>({});

  const handleAction = async (id: string, action: "approved" | "rejected") => {
    if (action === "approved") {
      // Execute the suggestion in GHL
      setExecutingId(id);
      try {
        const { data: result, error: fnError } = await supabase.functions.invoke("ghl-manage", {
          body: { action: "execute_suggestion", suggestionId: id },
        });

        if (fnError || !result?.success) {
          const errorMsg = result?.error || fnError?.message || "Erro ao executar a sugestão no CRM.";
          toast({ title: "Erro ao executar", description: errorMsg, variant: "destructive" });
          // Still update locally to show the error state
          setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "approved" as SuggestionStatus } : s));
          return;
        }

        setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "approved" as SuggestionStatus } : s));
        setExecutionResults(prev => ({
          ...prev,
          [id]: {
            opportunityCreated: result.data?.opportunityCreated ?? false,
            message: result.data?.message || "Ação aplicada com sucesso.",
          },
        }));
        toast({
          title: "✅ Sugestão executada!",
          description: result.data?.message || "Ação aplicada com sucesso no CRM.",
        });
      } catch (error) {
        toast({ title: "Erro", description: "Falha ao conectar com o CRM.", variant: "destructive" });
      } finally {
        setExecutingId(null);
      }
    } else {
      // Reject
      try {
        const { error } = await supabase
          .from("suggestions")
          .update({ status: action })
          .eq("id", id);
        if (error) throw error;
        setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: action } : s));
        toast({ title: "Sugestão rejeitada", description: "A sugestão foi descartada." });
      } catch {
        toast({ title: "Erro", description: "Não foi possível atualizar a sugestão.", variant: "destructive" });
      }
    }
  };

  const filtered = filter === "all" ? suggestions : suggestions.filter(s => s.status === filter);
  const pendingCount = suggestions.filter(s => s.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Sugestões da IA
          </h1>
          <p className="text-muted-foreground">{pendingCount} sugestões pendentes de revisão</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="w-4 h-4 mr-1" /> Configurar IA
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <p className="text-sm font-semibold text-foreground mb-3">Configuração da IA</p>
              <div className="space-y-4">
                {suggestionTypeOptions.map(opt => (
                  <div key={opt.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground">{opt.label}</span>
                      <Switch
                        checked={aiConfig[opt.key]?.enabled ?? true}
                        onCheckedChange={() => toggleEnabled(opt.key)}
                      />
                    </div>
                    {aiConfig[opt.key]?.enabled && (
                      <div className="flex items-center justify-between pl-4">
                        <span className="text-xs text-muted-foreground">Auto-aprovar</span>
                        <Switch
                          checked={aiConfig[opt.key]?.autoApprove ?? false}
                          onCheckedChange={() => toggleAutoApprove(opt.key)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Filter className="w-4 h-4 text-muted-foreground" />
          {(["all", "pending", "approved", "rejected"] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "Todas" : f === "pending" ? "Pendentes" : f === "approved" ? "Aprovadas" : "Rejeitadas"}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma sugestão encontrada</h3>
          <p className="text-sm text-muted-foreground">
            As sugestões aparecerão aqui quando a IA analisar suas conversas do WhatsApp.
          </p>
        </div>
      ) : (
        <AnimatePresence>
          <div className="space-y-4">
            {filtered.map((suggestion, i) => (
              <motion.div
                key={suggestion.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card p-5"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <Badge variant="outline" className={typeColors[suggestion.type] || ""}>
                        {ACTION_TYPE_LABELS[suggestion.type] || suggestion.type}
                      </Badge>
                      <span className="text-sm text-muted-foreground">•</span>
                      <span className="text-sm text-muted-foreground">
                        {suggestion.action_data?.contact_name || "Contato"}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(suggestion.created_at).toLocaleString("pt-BR")}
                      </span>
                      {suggestion.status !== "pending" && (
                        <Badge variant={suggestion.status === "approved" ? "default" : "destructive"}>
                          {suggestion.status === "approved" ? "Aprovada" : "Rejeitada"}
                        </Badge>
                      )}
                    </div>

                    <h4 className="text-sm font-semibold text-foreground mb-2">{suggestion.title}</h4>

                    {(suggestion.action_data?.field || suggestion.action_data?.value) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                        {suggestion.action_data?.field && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Campo</p>
                            <p className="text-sm text-foreground font-medium">{suggestion.action_data.field}</p>
                          </div>
                        )}
                        {suggestion.action_data?.value && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Valor sugerido</p>
                            <p className="text-sm text-primary font-semibold flex items-center gap-1">
                              <ArrowRight className="w-3 h-3" /> {suggestion.action_data.value}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {suggestion.description && (
                      <div className="bg-muted/50 rounded-lg p-3 mb-3">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <p className="text-sm text-foreground">{suggestion.description}</p>
                        </div>
                      </div>
                    )}

                    {suggestion.status === "pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleAction(suggestion.id, "approved")} disabled={executingId === suggestion.id}>
                          {executingId === suggestion.id ? (
                            <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Executando...</>
                          ) : (
                            <><Check className="w-4 h-4 mr-1" /> Aprovar e Executar</>
                          )}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleAction(suggestion.id, "rejected")} disabled={!!executingId}>
                          <X className="w-4 h-4 mr-1" /> Rejeitar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
};

export default Suggestions;
