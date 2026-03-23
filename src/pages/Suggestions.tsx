import { useState } from "react";
import { Sparkles, Check, X, MessageSquare, ArrowRight, Filter, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

type SuggestionStatus = "pending" | "approved" | "rejected";

interface Suggestion {
  id: string;
  type: string;
  field: string;
  suggestedValue: string;
  justification: string;
  excerpt: string;
  contactName: string;
  status: SuggestionStatus;
}

const initialSuggestions: Suggestion[] = [
  {
    id: "1", type: "Atualizar valor", field: "Valor da oportunidade", suggestedValue: "R$ 1.500,00",
    justification: "O lead mencionou explicitamente o valor que deseja pagar.",
    excerpt: "\"Quero comprar por R$1500\"", contactName: "João Silva", status: "pending",
  },
  {
    id: "2", type: "Criar nota", field: "Notas do contato", suggestedValue: "Ligar amanhã às 10h",
    justification: "O lead solicitou retorno por telefone em horário específico.",
    excerpt: "\"Pode me ligar amanhã às 10h?\"", contactName: "Ana Oliveira", status: "pending",
  },
  {
    id: "3", type: "Mover etapa", field: "Etapa do funil", suggestedValue: "Fechado - Ganho",
    justification: "O lead confirmou o fechamento do negócio.",
    excerpt: "\"Já fechei com vocês!\"", contactName: "Carlos Lima", status: "pending",
  },
  {
    id: "4", type: "Atualizar valor", field: "Valor da oportunidade", suggestedValue: "R$ 3.200,00",
    justification: "O lead mencionou orçamento disponível.",
    excerpt: "\"Temos R$3200 de orçamento para isso\"", contactName: "Maria Santos", status: "approved",
  },
  {
    id: "5", type: "Criar nota", field: "Notas do contato", suggestedValue: "Lead demonstrou objeção de preço",
    justification: "O lead expressou que o valor está acima do esperado.",
    excerpt: "\"Achei um pouco caro, tem desconto?\"", contactName: "Pedro Costa", status: "rejected",
  },
];

const typeColors: Record<string, string> = {
  "Atualizar valor": "bg-info/10 text-info border-info/20",
  "Criar nota": "bg-warning/10 text-warning border-warning/20",
  "Mover etapa": "bg-success/10 text-success border-success/20",
  "Preencher campo": "bg-primary/10 text-primary border-primary/20",
  "Agendar lembrete": "bg-accent/10 text-accent-foreground border-accent/20",
  "Marcar resultado": "bg-destructive/10 text-destructive border-destructive/20",
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
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [filter, setFilter] = useState<SuggestionStatus | "all">("all");
  const [enabledTypes, setEnabledTypes] = useState<Record<string, boolean>>(
    Object.fromEntries(suggestionTypeOptions.map(o => [o.key, true]))
  );
  const { toast } = useToast();

  const toggleType = (key: string) => {
    setEnabledTypes(prev => ({ ...prev, [key]: !prev[key] }));
    toast({ title: "Configuração atualizada", description: "As preferências de sugestões foram salvas." });
  };

  const handleAction = (id: string, action: "approved" | "rejected") => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: action } : s));
    toast({
      title: action === "approved" ? "Sugestão aprovada!" : "Sugestão rejeitada",
      description: action === "approved" ? "Os dados serão atualizados no GHL." : "A sugestão foi descartada.",
    });
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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="w-4 h-4 mr-1" /> Configurar tipos
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <p className="text-sm font-semibold text-foreground mb-3">Tipos de sugestão ativos</p>
              <div className="space-y-3">
                {suggestionTypeOptions.map(opt => (
                  <div key={opt.key} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{opt.label}</span>
                    <Switch checked={enabledTypes[opt.key]} onCheckedChange={() => toggleType(opt.key)} />
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
                      {suggestion.type}
                    </Badge>
                    <span className="text-sm text-muted-foreground">•</span>
                    <span className="text-sm text-muted-foreground">{suggestion.contactName}</span>
                    {suggestion.status !== "pending" && (
                      <Badge variant={suggestion.status === "approved" ? "default" : "destructive"} className="ml-auto">
                        {suggestion.status === "approved" ? "Aprovada" : "Rejeitada"}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Campo</p>
                      <p className="text-sm text-foreground font-medium">{suggestion.field}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Valor sugerido</p>
                      <p className="text-sm text-primary font-semibold flex items-center gap-1">
                        <ArrowRight className="w-3 h-3" /> {suggestion.suggestedValue}
                      </p>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-3 mb-3">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm text-foreground italic">{suggestion.excerpt}</p>
                        <p className="text-xs text-muted-foreground mt-1">{suggestion.justification}</p>
                      </div>
                    </div>
                  </div>

                  {suggestion.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleAction(suggestion.id, "approved")}>
                        <Check className="w-4 h-4 mr-1" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleAction(suggestion.id, "rejected")}>
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
    </div>
  );
};

export default Suggestions;
