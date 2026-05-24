import { Seller } from "@/hooks/useGhlData";
import { Users, Trophy, Medal } from "lucide-react";
import { SectionTooltip } from "./SectionTooltip";

interface SellerPerformanceProps { sellers: Seller[]; }

function formatResponseTime(minutes: number | null | undefined): string {
  if (minutes == null || !isFinite(minutes) || minutes <= 0) return "—";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const days = hours / 24;
  return `${days.toFixed(1)} dias`;
}

export function SellerPerformance({ sellers }: SellerPerformanceProps) {
  const sortedSellers = [...sellers].sort((a, b) => b.vendaGanha - a.vendaGanha);

  const getRankBadge = (i: number) => {
    if (i === 0) return <Trophy className="w-4 h-4 text-warning-ink" />;
    if (i === 1) return <Medal className="w-4 h-4 text-muted-foreground" />;
    if (i === 2) return <Medal className="w-4 h-4 text-warning-ink/70" />;
    return null;
  };

  if (sellers.length === 0) {
    return (
      <div className="dashboard-section animate-slide-up">
        <h2 className="section-title">
          <Users className="w-5 h-5 text-primary-ink" />
          Performance por Vendedor
        </h2>
        <p className="text-muted-foreground text-center py-8">Nenhum vendedor com oportunidades no período.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-section animate-slide-up">
      <h2 className="section-title">
        <Users className="w-5 h-5 text-primary-ink" />
        Performance por Vendedor
        <SectionTooltip text="Comparativo entre vendedores: oportunidades atribuídas por etapa, taxa de conversão e tempo médio de resposta individual." />
      </h2>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Vendedor</th>
              <th className="text-center">Contato Inicial</th>
              <th className="text-center">Proposta Enviada</th>
              <th className="text-center">Fechamento</th>
              <th className="text-center">Venda Ganha</th>
              <th className="text-center">Taxa Conversão</th>
              <th className="text-center">Tempo Médio Resposta</th>
            </tr>
          </thead>
          <tbody>
            {sortedSellers.map((s, i) => {
              const rate = s.contatoInicial > 0 ? ((s.vendaGanha / s.contatoInicial) * 100).toFixed(1) : "0.0";
              const respLabel = formatResponseTime(s.avgResponseMinutes);
              return (
                <tr key={(s.id || s.name) + i}>
                  <td className="font-semibold w-12">
                    <div className="flex items-center gap-2">{getRankBadge(i)}{i + 1}</div>
                  </td>
                  <td className="font-semibold">{s.name}</td>
                  <td className="text-center">
                    <span className="inline-flex items-center justify-center min-w-10 h-7 px-2 bg-funnel-1/10 text-funnel-1-ink rounded-lg font-bold text-sm">{s.contatoInicial}</span>
                  </td>
                  <td className="text-center">
                    <span className="inline-flex items-center justify-center min-w-10 h-7 px-2 bg-funnel-2/10 text-funnel-2-ink rounded-lg font-bold text-sm">{s.propostaEnviada}</span>
                  </td>
                  <td className="text-center">
                    <span className="inline-flex items-center justify-center min-w-10 h-7 px-2 bg-funnel-3/10 text-funnel-3-ink rounded-lg font-bold text-sm">{s.fechamento}</span>
                  </td>
                  <td className="text-center">
                    <span className="inline-flex items-center justify-center min-w-10 h-7 px-2 bg-funnel-4/10 text-funnel-4-ink rounded-lg font-bold text-sm">{s.vendaGanha}</span>
                  </td>
                  <td className="text-center"><span className="font-bold text-primary-ink">{rate}%</span></td>
                  <td className="text-center">
                    <span className="font-semibold text-foreground tabular-nums">{respLabel}</span>
                    {s.responseCount ? (
                      <span className="block text-[10px] text-muted-foreground">{s.responseCount} resposta{s.responseCount === 1 ? "" : "s"}</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
