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

  const gradients = [
    "hsl(var(--funnel-1))",
    "hsl(var(--funnel-2))",
    "hsl(var(--funnel-3))",
    "hsl(var(--funnel-4))",
  ];

  const totalStages = funnelStages.length;
  const lostPercentage = funnelStages[0]?.count > 0 ? (lostLeads / funnelStages[0].count) * 100 : 0;

  return (
    <div className="dashboard-section animate-slide-up">
      <div className="flex items-center justify-between mb-6">
        <h2 className="section-title mb-0">
          <TrendingUp className="w-5 h-5 text-accent" />
          Visão Geral do Funil
          <SectionTooltip text="Etapas do funil de oportunidades com taxas de conversão entre fases. Clique em 'Perdidas' para ver detalhes." />
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Conversão geral:</span>
          <span className="font-extrabold text-accent text-lg">{formatPercentage(conversionRates.overallConversion)}</span>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 flex flex-col items-center gap-0">
          {funnelStages.map((stage, index) => {
            const topWidth = 100 - (index / totalStages) * 60;
            const bottomWidth = 100 - ((index + 1) / totalStages) * 60;
            const color = gradients[index] || gradients[gradients.length - 1];
            return (
              <div key={stage.id} className="w-full flex flex-col items-center">
                <div
                  className="relative group transition-transform duration-200 hover:scale-[1.02] cursor-pointer"
                  style={{ width: "100%", maxWidth: "700px" }}
                  onClick={() => setSelectedStage({ title: stage.name, leads: stage.leads || [] })}
                >
                  <svg viewBox="0 0 700 70" className="w-full h-auto" preserveAspectRatio="none" style={{ display: "block" }}>
                    <defs>
                      <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="white" stopOpacity="0" />
                        <stop offset="50%" stopColor="white" stopOpacity="1" />
                        <stop offset="100%" stopColor="white" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {(() => {
                      const tl = (700 - 700 * topWidth / 100) / 2;
                      const tr = (700 + 700 * topWidth / 100) / 2;
                      const br = (700 + 700 * bottomWidth / 100) / 2;
                      const bl = (700 - 700 * bottomWidth / 100) / 2;
                      const r = 12;
                      const d = `M${tl + r},0 L${tr - r},0 Q${tr},0 ${tr},${r} L${br},${70 - r} Q${br},70 ${br - r},70 L${bl + r},70 Q${bl},70 ${bl},${70 - r} L${tl},${r} Q${tl},0 ${tl + r},0 Z`;
                      return (
                        <>
                          <path d={d} fill={color} className="transition-opacity duration-200 group-hover:opacity-90" />
                          <path d={d} fill="url(#shine)" opacity="0.12" />
                        </>
                      );
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-3 text-white">
                      <span className="text-sm font-bold drop-shadow-sm">{stage.name}</span>
                      <span className="text-lg font-extrabold drop-shadow-sm">{stage.count}</span>
                    </div>
                  </div>
                </div>

                {index < funnelStages.length - 1 && (
                  <div className="flex items-center gap-1.5 py-1.5 text-muted-foreground">
                    <ArrowDown className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold text-foreground">{formatPercentage(conversionLabels[index])}</span>
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
