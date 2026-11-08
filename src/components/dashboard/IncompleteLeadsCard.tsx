import { useMemo, useState } from "react";
import { ListTodo, ExternalLink, CheckCircle2 } from "lucide-react";
import { IncompleteLead } from "@/hooks/useMyPerformance";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SectionTooltip } from "./SectionTooltip";
import { cn } from "@/lib/utils";

interface IncompleteLeadsCardProps {
  leads: IncompleteLead[];
  total: number;
  ghlLocationId: string | null;
  /** Mostra o vendedor de cada lead (tela com mais de um vendedor). */
  showSeller?: boolean;
}

const STATUS_LABEL: Record<IncompleteLead["status"], { text: string; cls: string }> = {
  open: { text: "Em aberto", cls: "bg-primary/10 text-primary-ink" },
  won: { text: "Ganho", cls: "bg-success/10 text-success" },
  lost: { text: "Perdido", cls: "bg-muted text-muted-foreground" },
};

const ALL = "__all__";

/** Lista de pendências da Qualidade de Preenchimento: quais oportunidades do
 *  período estão com quais campos em branco, com atalho para abrir no GHL. */
export function IncompleteLeadsCard({ leads, total, ghlLocationId, showSeller = false }: IncompleteLeadsCardProps) {
  const hasOpen = leads.some((l) => l.status === "open");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [field, setField] = useState<string>(ALL);

  // Só em aberto vale quando existe algum aberto; senão mostra tudo.
  const openFilter = onlyOpen && hasOpen;
  const byStatus = useMemo(
    () => (openFilter ? leads.filter((l) => l.status === "open") : leads),
    [leads, openFilter],
  );

  // Campos que aparecem como pendentes, com a contagem dentro do recorte atual.
  const fieldCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of byStatus) for (const f of l.missing) m.set(f, (m.get(f) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  }, [byStatus]);

  const activeField = field !== ALL && fieldCounts.some(([f]) => f === field) ? field : ALL;
  const list = activeField === ALL ? byStatus : byStatus.filter((l) => l.missing.includes(activeField));

  const ghlLink = (id: string) =>
    ghlLocationId
      ? `https://app.gohighlevel.com/v2/location/${ghlLocationId}/opportunities/list?opportunityId=${id}`
      : null;

  return (
    <div className="dashboard-section animate-slide-up">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="section-title mb-0">
          <ListTodo className="w-5 h-5 text-primary-ink" />
          Leads com campos vazios
          <SectionTooltip text="Oportunidades do período com pelo menos um dos campos acompanhados em branco. É a mesma base do percentual de Qualidade de Preenchimento: preencher estes campos no GHL sobe o seu percentual." />
        </h2>
        {hasOpen && (
          <div className="flex items-center gap-2">
            <Switch id="only-open" checked={onlyOpen} onCheckedChange={setOnlyOpen} />
            <Label htmlFor="only-open" className="text-xs font-normal text-muted-foreground cursor-pointer">
              Só em aberto
            </Label>
          </div>
        )}
      </div>

      {leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
          <CheckCircle2 className="w-8 h-8 text-success" />
          <p className="text-sm font-medium text-foreground">Todos os campos preenchidos</p>
          <p className="text-xs text-muted-foreground">Nenhuma oportunidade do período com campo em branco.</p>
        </div>
      ) : (
        <>
          {fieldCounts.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Filtrar por campo">
              <FieldChip active={activeField === ALL} onClick={() => setField(ALL)}>
                Todos os campos · {byStatus.length}
              </FieldChip>
              {fieldCounts.map(([f, n]) => (
                <FieldChip key={f} active={activeField === f} onClick={() => setField(f)}>
                  {f} · {n}
                </FieldChip>
              ))}
            </div>
          )}

          <div className="max-h-[480px] overflow-y-auto -mx-1 px-1 divide-y divide-border">
            {list.map((lead) => {
              const href = ghlLink(lead.id);
              const status = STATUS_LABEL[lead.status];
              return (
                <div key={lead.id} className="py-3 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-foreground hover:text-primary-ink inline-flex items-center gap-1 max-w-full"
                        >
                          <span className="truncate underline underline-offset-2">{lead.name}</span>
                          <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
                          <span className="sr-only">(abre no GHL)</span>
                        </a>
                      ) : (
                        <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
                      )}
                      {(lead.stage || (showSeller && lead.seller)) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {[lead.stage, showSeller ? lead.seller : null].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0", status.cls)}>
                      {status.text}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {lead.missing.map((f) => (
                      <span
                        key={f}
                        className="text-[11px] px-2 py-0.5 rounded-full border bg-destructive/5 border-destructive/15 text-destructive-ink"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {list.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum lead neste filtro.</p>
            )}
          </div>

          {total > leads.length && (
            <p className="text-[11px] text-muted-foreground mt-3">
              Mostrando os {leads.length} primeiros de {total} leads com campos vazios. Reduza o período ou filtre por funil para ver o restante.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function FieldChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "text-xs px-2.5 py-1 rounded-full border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
