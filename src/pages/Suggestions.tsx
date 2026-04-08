import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Check, X, MessageSquare, ArrowRight, Filter, Settings2, Loader2, RefreshCw, User, Phone, ChevronDown, Search, XCircle, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useSuggestions, useAiConfig, useDisabledContacts } from "@/hooks/use-suggestions";

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
  ai_provider: string | null;
}

interface ContactGroup {
  key: string;
  contactName: string;
  contactPhone: string;
  suggestions: Suggestion[];
  pendingCount: number;
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
  const [openContacts, setOpenContacts] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [disabledContacts, setDisabledContacts] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();

  const fetchDisabledContacts = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("disabled_contacts")
        .select("contact_phone");
      if (data) {
        setDisabledContacts(new Set(data.map((d: any) => d.contact_phone)));
      }
    } catch { /* ignore */ }
  }, []);

  const toggleContactAI = async (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!phone) return;
    const isDisabled = disabledContacts.has(phone);
    try {
      if (isDisabled) {
        await supabase.from("disabled_contacts").delete().eq("contact_phone", phone);
        setDisabledContacts(prev => { const next = new Set(prev); next.delete(phone); return next; });
        toast({ title: "IA ativada", description: "A IA voltará a analisar este contato." });
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from("disabled_contacts").insert({ user_id: user.id, contact_phone: phone });
        setDisabledContacts(prev => new Set(prev).add(phone));
        toast({ title: "IA desativada", description: "A IA não analisará mais este contato." });
      }
    } catch {
      toast({ title: "Erro", description: "Não foi possível alterar a configuração.", variant: "destructive" });
    }
  };

  const fetchSuggestions = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("suggestions")
        .select("*")
        .eq("workspace_id", activeWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setSuggestions((data || []) as unknown as Suggestion[]);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  const fetchAiConfig = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const { data } = await supabase
        .from("ai_config")
        .select("action_type, enabled, auto_approve")
        .eq("workspace_id", activeWorkspace.id);

      if (data) {
        const config: typeof aiConfig = {
          mover_funil: { enabled: true, autoApprove: false },
          campo_personalizado: { enabled: true, autoApprove: false },
          adicionar_nota: { enabled: true, autoApprove: false },
          valor_negociacao: { enabled: true, autoApprove: false },
          agendar_lembrete: { enabled: true, autoApprove: false },
          ganho_perdido: { enabled: true, autoApprove: false },
        };
        for (const c of data) {
          config[c.action_type] = { enabled: c.enabled, autoApprove: c.auto_approve };
        }
        setAiConfig(config);
      }
    } catch { /* ignore */ }
  }, [activeWorkspace]);

  useEffect(() => {
    fetchSuggestions();
    fetchAiConfig();
    fetchDisabledContacts();
  }, [fetchSuggestions, fetchAiConfig, fetchDisabledContacts]);

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
      if (!user || !activeWorkspace) return;

      // Check if record exists for this workspace
      const { data: existing } = await supabase
        .from("ai_config")
        .select("id")
        .eq("user_id", user.id)
        .eq("action_type", actionType)
        .eq("workspace_id", activeWorkspace.id)
        .maybeSingle();

      if (existing) {
        await supabase.from("ai_config")
          .update({ enabled: config.enabled, auto_approve: config.autoApprove })
          .eq("id", existing.id);
      } else {
        await supabase.from("ai_config")
          .insert({
            user_id: user.id,
            action_type: actionType,
            enabled: config.enabled,
            auto_approve: config.autoApprove,
            workspace_id: activeWorkspace.id,
          });
      }
    } catch (error) {
      console.error("Error saving ai config:", error);
    }
  };

  const [executingId, setExecutingId] = useState<string | null>(null);
  const [executionResults, setExecutionResults] = useState<Record<string, { opportunityCreated: boolean; contactCreated: boolean; message: string }>>({});

  const handleAction = async (id: string, action: "approved" | "rejected") => {
    if (action === "approved") {
      setExecutingId(id);
      try {
        const { data: result, error: fnError } = await supabase.functions.invoke("ghl-manage", {
          body: { action: "execute_suggestion", suggestionId: id, workspace_id: activeWorkspace?.id },
        });

        if (fnError || !result?.success) {
          const errorMsg = result?.error || fnError?.message || "Erro ao executar a sugestão no CRM.";
          toast({ title: "Erro ao executar", description: errorMsg, variant: "destructive" });
          setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "approved" as SuggestionStatus } : s));
          return;
        }

        setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "approved" as SuggestionStatus } : s));
        setExecutionResults(prev => ({
          ...prev,
          [id]: {
            opportunityCreated: result.data?.opportunityCreated ?? false,
            contactCreated: result.data?.contactCreated ?? false,
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

  const filtered = useMemo(() => {
    let result = filter === "all" ? suggestions : suggestions.filter(s => s.status === filter);
    if (typeFilter !== "all") {
      result = result.filter(s => s.type === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(s => {
        const name = (s.action_data?.contact_name || "").toLowerCase();
        const phone = (s.action_data?.contact_phone || "").toLowerCase();
        return name.includes(q) || phone.includes(q);
      });
    }
    return result;
  }, [suggestions, filter, typeFilter, searchQuery]);
  const pendingCount = suggestions.filter(s => s.status === "pending").length;
  const contactGroups: ContactGroup[] = useMemo(() => {
    const groups = new Map<string, ContactGroup>();

    for (const s of filtered) {
      const name = s.action_data?.contact_name || "Contato desconhecido";
      const phone = s.action_data?.contact_phone || "";
      const key = `${phone || name}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          contactName: name,
          contactPhone: phone,
          suggestions: [],
          pendingCount: 0,
        });
      }

      const group = groups.get(key)!;
      group.suggestions.push(s);
      if (s.status === "pending") group.pendingCount++;
    }

    // Sort: contacts with pending suggestions first, then by most recent suggestion
    return Array.from(groups.values()).sort((a, b) => {
      if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
      if (b.pendingCount > 0 && a.pendingCount === 0) return 1;
      const aLatest = a.suggestions[0]?.created_at || "";
      const bLatest = b.suggestions[0]?.created_at || "";
      return bLatest.localeCompare(aLatest);
    });
  }, [filtered]);

  const toggleContact = (key: string) => {
    setOpenContacts(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const [rejectingContact, setRejectingContact] = useState<string | null>(null);

  const handleRejectAllByContact = async (group: ContactGroup) => {
    const pendingIds = group.suggestions.filter(s => s.status === "pending").map(s => s.id);
    if (pendingIds.length === 0) return;
    setRejectingContact(group.key);
    try {
      const { error } = await supabase
        .from("suggestions")
        .update({ status: "rejected" })
        .in("id", pendingIds);
      if (error) throw error;
      setSuggestions(prev => prev.map(s => pendingIds.includes(s.id) ? { ...s, status: "rejected" as SuggestionStatus } : s));
      toast({ title: "Sugestões rejeitadas", description: `${pendingIds.length} sugestão(ões) de ${group.contactName} foram rejeitadas.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível rejeitar as sugestões.", variant: "destructive" });
    } finally {
      setRejectingContact(null);
    }
  };

  // All contacts start closed by default

  const formatPhone = (phone: string) => {
    if (!phone) return "";
    const clean = phone.replace(/\D/g, "");
    if (clean.length === 13) return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    if (clean.length === 12) return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`;
    return phone;
  };

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

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Tipo de sugestão" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {suggestionTypeOptions.map(opt => (
              <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : contactGroups.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma sugestão encontrada</h3>
          <p className="text-sm text-muted-foreground">
            As sugestões aparecerão aqui quando a IA analisar suas conversas do WhatsApp.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {contactGroups.map((group) => (
            <Collapsible
              key={group.key}
              open={openContacts.has(group.key)}
              onOpenChange={() => toggleContact(group.key)}
            >
              <CollapsibleTrigger asChild>
                <button className={`w-full glass-card p-4 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer rounded-lg ${group.contactPhone && disabledContacts.has(group.contactPhone) ? "opacity-50 border-dashed" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${group.contactPhone && disabledContacts.has(group.contactPhone) ? "bg-muted" : "bg-primary/10"}`}>
                      <User className={`w-5 h-5 ${group.contactPhone && disabledContacts.has(group.contactPhone) ? "text-muted-foreground" : "text-primary"}`} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">{group.contactName}</p>
                      {group.contactPhone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {formatPhone(group.contactPhone)}
                        </p>
                      )}
                    </div>
                  </div>
                   <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {group.suggestions.length} sugestão{group.suggestions.length !== 1 ? "ões" : ""}
                      </span>
                      {group.pendingCount > 0 && (
                        <Badge variant="default" className="text-xs">
                          {group.pendingCount} pendente{group.pendingCount !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    {group.contactPhone && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 px-2 ${disabledContacts.has(group.contactPhone) ? "text-muted-foreground hover:text-foreground" : "text-primary hover:text-primary"}`}
                        onClick={(e) => toggleContactAI(group.contactPhone, e)}
                        title={disabledContacts.has(group.contactPhone) ? "IA desativada para este contato" : "IA ativa para este contato"}
                      >
                        <Power className="w-3.5 h-3.5 mr-1" />
                        <span className="text-xs">{disabledContacts.has(group.contactPhone) ? "IA off" : "IA on"}</span>
                      </Button>
                    )}
                    {group.pendingCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                        disabled={rejectingContact === group.key}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRejectAllByContact(group);
                        }}
                      >
                        {rejectingContact === group.key ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <><XCircle className="w-3.5 h-3.5 mr-1" /> Rejeitar todas</>
                        )}
                      </Button>
                    )}
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${openContacts.has(group.key) ? "rotate-180" : ""}`} />
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <AnimatePresence>
                  <div className="space-y-3 pl-4 border-l-2 border-primary/20 ml-5 mt-2 mb-2">
                    {group.suggestions.map((suggestion, i) => (
                      <motion.div
                        key={suggestion.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="glass-card p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge variant="outline" className={typeColors[suggestion.type] || ""}>
                                {ACTION_TYPE_LABELS[suggestion.type] || suggestion.type}
                              </Badge>
                              {suggestion.ai_provider && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                                  {suggestion.ai_provider.startsWith("openai") ? "🤖 OpenAI" : "✨ Lovable AI"}
                                  {suggestion.ai_provider.includes("/") && (
                                    <span className="ml-1 opacity-60">{suggestion.ai_provider.split("/").pop()}</span>
                                  )}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground ml-auto">
                                {new Date(suggestion.created_at).toLocaleString("pt-BR")}
                              </span>
                              {suggestion.status !== "pending" && (
                                <Badge variant={suggestion.status === "approved" ? "default" : "destructive"}>
                                  {suggestion.status === "approved" ? "Aprovada" : "Rejeitada"}
                                </Badge>
                              )}
                              {suggestion.status === "approved" && executionResults[suggestion.id] && (
                                <>
                                  {executionResults[suggestion.id].contactCreated && (
                                    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                                      👤 Contato criado
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className={executionResults[suggestion.id].opportunityCreated
                                    ? "bg-success/10 text-success border-success/20"
                                    : "bg-info/10 text-info border-info/20"
                                  }>
                                    {executionResults[suggestion.id].opportunityCreated ? "🆕 Oportunidade criada" : "📌 Oportunidade existente"}
                                  </Badge>
                                </>
                              )}
                            </div>

                            <h4 className="text-sm font-semibold text-foreground mb-2">{suggestion.title}</h4>

                            {(suggestion.action_data?.field || suggestion.action_data?.value) && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                                {suggestion.action_data?.field && (
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-0.5">Campo</p>
                                    <p className="text-sm text-foreground font-medium">{suggestion.action_data.field}</p>
                                  </div>
                                )}
                                {suggestion.action_data?.value && (
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-0.5">Valor sugerido</p>
                                    <p className="text-sm text-primary font-semibold flex items-center gap-1">
                                      <ArrowRight className="w-3 h-3" /> {suggestion.action_data.value}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                            {suggestion.description && (
                              <div className="bg-muted/50 rounded-lg p-3 mb-2">
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
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
};

export default Suggestions;
