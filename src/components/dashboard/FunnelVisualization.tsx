import { useState } from "react";
import { FunnelStage, ConversionRates, StageLead } from "@/hooks/useGhlData";
import { TrendingUp, ArrowDown, XCircle } from "lucide-react";
import { SectionTooltip } from "./SectionTooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FunnelVisualizationProps {
  funnelStages: FunnelStage[];
  conversionRates: ConversionRates;
  lostLeads: number;
  lostLeadsDetail?: StageLead[];
}

const formatPercentage = (v: number) => `${v.toFixed(1)}%`;

function LeadListDialog({ open, onOpenChange, title, leads }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; leads: StageLead[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title} ({leads.length})</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">#</TableHead>
                <TableHead>Oportunidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{lead.id}</TableCell>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                </TableRow>
              ))}
              {leads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-8">Nenhuma oportunidade nesta etapa</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

const stageAccents = [
  { bg: "bg-funnel-1", border: "border-funnel-1/40", icon: "text-funnel-1-ink" },
  { bg: "bg-funnel-2", border: "border-funnel-2/40", icon: "text-funnel-2-ink" },
  { bg: "bg-funnel-3", border: "border-funnel-3/40", icon: "text-funnel-3-ink" },
  { bg: "bg-funnel-4", border: "border-funnel-4/40", icon: "text-funnel-4-ink" },
];

export function FunnelVisualization({ funnelStages, conversionRates, lostLeads, lostLeadsDetail = [] }: FunnelVisualizationProps) {
  const [selectedStage, setSelectedStage] = useState<{ title: string; leads: StageLead[] } | null>(null);

  const conversionLabels = [
    conversionRates.contatoToProsposta,
    conversionRates.propostaToFechamento,
    conversionRates.fechamentoToVenda,
  ];

  const topPassage = funnelStages[0]?.count ?? 0;
  const lostPercentage = topPassage > 0 ? (lostLeads / topPassage) * 100 : 0;

  // Tapering widths to keep the funnel feel without trapezoidal shapes
  const stageWidths = ["w-full", "w-[92%]", "w-[80%]", "w-[66%]"];

  return (
    <div className="dashboard-section animate-slide-up">
      <div className="flex items-center justify-between mb-6">
        <h2 className="section-title mb-0">
          <TrendingUp className="w-5 h-5 text-primary-ink" />
          Visão Geral - Funil de Passagem
          <SectionTooltip text="Funil de passagem: cada etapa mostra o total de leads que JÁ PASSARAM por ela (ou seja, soma os que estão nela com os que avançaram para etapas posteriores). O número menor entre parênteses indica quantos leads estão atualmente nessa etapa. As taxas de conversão refletem o quanto seguiu para a próxima etapa. Clique em uma etapa para ver os leads que estão nela hoje." />
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Conversão geral:</span>
          <span className="font-extrabold text-primary-ink text-lg">{formatPercentage(conversionRates.overallConversion)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Funnel Flow */}
        <div className="lg:col-span-2 flex flex-col items-center">
          {funnelStages.map((stage, index) => {
            const isLast = index === funnelStages.length - 1;
            const accent = stageAccents[index] || stageAccents[stageAccents.length - 1];
            const widthClass = stageWidths[index] || stageWidths[stageWidths.length - 1];
            const stageNumber = String(index + 1).padStart(2, "0");

            return (
              <div key={stage.id} className={`${widthClass} flex flex-col items-center`}>
                <button
                  type="button"
                  onClick={() => setSelectedStage({ title: stage.name, leads: stage.leads || [] })}
                  className={`relative w-full text-left rounded-xl border transition-all overflow-hidden cursor-pointer shadow-sm hover:shadow-md hover:brightness-105 ${accent.border} ${accent.bg}`}
                >
                  <div className="relative p-4 flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/80">
                        {isLast ? "Final" : `Etapa ${stageNumber}`}
                      </span>
                      <h3 className="text-base font-bold text-white">
                        {stage.name}
                      </h3>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-extrabold leading-none text-white">
                        {stage.count}
                      </div>
                      {typeof stage.currentCount === "number" && (
                        <div className="text-[11px] font-medium mt-1 text-white/80">
                          <span className="opacity-70">atual:</span> {stage.currentCount}
                        </div>
                      )}
                    </div>
                  </div>
                </button>

                {!isLast && (
                  <div className="h-9 flex flex-col items-center justify-center relative w-full">
                    <div className="w-px h-full bg-border"></div>
                    <div className="absolute bg-card border border-border px-2.5 py-1 rounded-full shadow-sm">
                      <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                        <ArrowDown className={`w-3 h-3 ${accent.icon}`} />
                        {formatPercentage(conversionLabels[index])}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Lost Opportunities Card */}
        <div className="lg:col-span-1">
          <div
            className="relative bg-card border border-border rounded-2xl p-6 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedStage({ title: "Oportunidades Perdidas", leads: lostLeadsDetail })}
          >
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-destructive/10 blur-3xl rounded-full pointer-events-none"></div>

            <div className="relative">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-destructive" />
                </div>
                <h4 className="font-bold text-foreground">Oportunidades Perdidas</h4>
              </div>

              <div className="space-y-6">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Total acumulado</div>
                  <div className="text-4xl font-black text-destructive tabular-nums">{lostLeads}</div>
                </div>

                <div className="pt-6 border-t border-border">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm font-medium text-muted-foreground">Taxa de perda</span>
                    <span className="text-xl font-bold text-foreground">{formatPercentage(lostPercentage)}</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-destructive rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.max(2, lostPercentage))}%` }}
                    />
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground italic">
                  Refere-se a leads que saíram do funil antes de atingir a etapa de Venda Ganha.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <LeadListDialog
        open={!!selectedStage}
        onOpenChange={(o) => !o && setSelectedStage(null)}
        title={selectedStage?.title || ""}
        leads={selectedStage?.leads || []}
      />
    </div>
  );
}
