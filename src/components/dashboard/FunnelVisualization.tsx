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

export function FunnelVisualization({ funnelStages, conversionRates, lostLeads, lostLeadsDetail = [] }: FunnelVisualizationProps) {
  const [selectedStage, setSelectedStage] = useState<{ title: string; leads: StageLead[] } | null>(null);

  const conversionLabels = [
    conversionRates.contatoToProsposta,
    conversionRates.propostaToFechamento,
    conversionRates.fechamentoToVenda,
  ];

  const colors = [
    "hsl(var(--funnel-1))",
    "hsl(var(--funnel-2))",
    "hsl(var(--funnel-3))",
    "hsl(var(--funnel-4))",
  ];

  const maxCount = Math.max(...funnelStages.map((s) => s.count), 1);
  const lostPercentage = funnelStages[0]?.count > 0 ? (lostLeads / funnelStages[0].count) * 100 : 0;

  return (
    <div className="dashboard-section animate-slide-up">
      <div className="flex items-center justify-between mb-6">
        <h2 className="section-title mb-0">
          <TrendingUp className="w-5 h-5 text-accent" />
          Visão Geral do Funil
          <SectionTooltip text="Etapas do funil de oportunidades com taxas de conversão entre fases. Clique em uma etapa para ver os leads." />
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Conversão geral:</span>
          <span className="font-extrabold text-accent text-lg">{formatPercentage(conversionRates.overallConversion)}</span>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 flex flex-col gap-1.5">
          {funnelStages.map((stage, index) => {
            const widthPct = Math.max((stage.count / maxCount) * 100, 8);
            const color = colors[index] || colors[colors.length - 1];
            return (
              <div key={stage.id} className="w-full">
                <div
                  className="relative group cursor-pointer rounded-lg overflow-hidden h-14 transition-transform duration-200 hover:translate-x-1"
                  onClick={() => setSelectedStage({ title: stage.name, leads: stage.leads || [] })}
                >
                  {/* Trilha de fundo */}
                  <div className="absolute inset-0 bg-muted/40 rounded-lg" />
                  {/* Barra preenchida */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-lg transition-all duration-300 group-hover:brightness-110"
                    style={{ width: `${widthPct}%`, backgroundColor: color }}
                  />
                  {/* Conteúdo */}
                  <div className="relative h-full flex items-center justify-between px-4">
                    <span className="text-sm font-bold text-white drop-shadow-sm">{stage.name}</span>
                    <div className="flex items-center gap-2 bg-background/90 px-2.5 py-0.5 rounded-md">
                      <span className="text-base font-extrabold text-foreground">{stage.count}</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">leads</span>
                    </div>
                  </div>
                </div>

                {index < funnelStages.length - 1 && (
                  <div className="flex items-center gap-1.5 pl-4 py-1 text-muted-foreground">
                    <ArrowDown className="w-3 h-3" />
                    <span className="text-xs font-bold text-foreground">{formatPercentage(conversionLabels[index])}</span>
                    <span className="text-[10px] text-muted-foreground">de conversão</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="w-44 flex flex-col items-center justify-center">
          <div
            className="bg-destructive/10 rounded-2xl p-6 text-center w-full border border-destructive/20 cursor-pointer hover:bg-destructive/15 transition-colors"
            onClick={() => setSelectedStage({ title: "Oportunidades Perdidas", leads: lostLeadsDetail })}
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              <XCircle className="w-5 h-5 text-destructive" />
              <span className="text-sm font-bold text-destructive uppercase tracking-widest">Perdidas</span>
            </div>
            <p className="text-3xl font-extrabold text-destructive mb-1">{lostLeads}</p>
            <p className="text-xs text-muted-foreground">oportunidades</p>
            <div className="mt-3 pt-3 border-t border-destructive/20">
              <p className="text-xs text-muted-foreground">Taxa de perda</p>
              <p className="text-lg font-extrabold text-destructive">{formatPercentage(lostPercentage)}</p>
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
