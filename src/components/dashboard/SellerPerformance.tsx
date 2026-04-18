import { Seller } from "@/hooks/useGhlData";
import { Users, Trophy, Medal } from "lucide-react";
import { SectionTooltip } from "./SectionTooltip";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface SellerPerformanceProps { sellers: Seller[]; }

export function SellerPerformance({ sellers }: SellerPerformanceProps) {
  const sortedSellers = [...sellers].sort((a, b) => b.vendaGanha - a.vendaGanha);
  const chartData = sellers.slice(0, 10).map((s) => ({
    name: s.name.split(" ")[0],
    "Contato Inicial": s.contatoInicial,
    "Proposta Enviada": s.propostaEnviada,
    Fechamento: s.fechamento,
    "Venda Ganha": s.vendaGanha,
  }));

  const getRankBadge = (i: number) => {
    if (i === 0) return <Trophy className="w-4 h-4 text-chart-3" />;
    if (i === 1) return <Medal className="w-4 h-4 text-muted-foreground" />;
    if (i === 2) return <Medal className="w-4 h-4 text-chart-3/70" />;
    return null;
  };

  if (sellers.length === 0) {
    return (
      <div className="dashboard-section animate-slide-up">
        <h2 className="section-title">
          <Users className="w-5 h-5 text-primary" />
          Performance por Vendedor
        </h2>
        <p className="text-muted-foreground text-center py-8">Nenhum vendedor com oportunidades no período.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-section animate-slide-up">
      <h2 className="section-title">
        <Users className="w-5 h-5 text-primary" />
        Performance por Vendedor
        <SectionTooltip text="Comparativo entre vendedores: oportunidades atribuídas por etapa e taxa de conversão individual." />
      </h2>

      <div className="h-72 mb-8">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))", fontWeight: 500 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "16px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
              }}
              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 700 }}
            />
            <Legend wrapperStyle={{ paddingTop: "16px" }} iconType="circle" iconSize={8} />
            <Bar dataKey="Contato Inicial" fill="hsl(var(--funnel-1))" radius={[6, 6, 0, 0]} />
            <Bar dataKey="Proposta Enviada" fill="hsl(var(--funnel-2))" radius={[6, 6, 0, 0]} />
            <Bar dataKey="Fechamento" fill="hsl(var(--funnel-3))" radius={[6, 6, 0, 0]} />
            <Bar dataKey="Venda Ganha" fill="hsl(var(--funnel-4))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

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
            </tr>
          </thead>
          <tbody>
            {sortedSellers.map((s, i) => {
              const rate = s.contatoInicial > 0 ? ((s.vendaGanha / s.contatoInicial) * 100).toFixed(1) : "0.0";
              return (
                <tr key={s.name + i}>
                  <td className="font-semibold w-12">
                    <div className="flex items-center gap-2">{getRankBadge(i)}{i + 1}</div>
                  </td>
                  <td className="font-semibold">{s.name}</td>
                  <td className="text-center">
                    <span className="inline-flex items-center justify-center min-w-10 h-7 px-2 bg-funnel-1/10 text-funnel-1 rounded-lg font-bold text-sm">{s.contatoInicial}</span>
                  </td>
                  <td className="text-center">
                    <span className="inline-flex items-center justify-center min-w-10 h-7 px-2 bg-funnel-2/10 text-funnel-2 rounded-lg font-bold text-sm">{s.propostaEnviada}</span>
                  </td>
                  <td className="text-center">
                    <span className="inline-flex items-center justify-center min-w-10 h-7 px-2 bg-funnel-3/10 text-funnel-3 rounded-lg font-bold text-sm">{s.fechamento}</span>
                  </td>
                  <td className="text-center">
                    <span className="inline-flex items-center justify-center min-w-10 h-7 px-2 bg-funnel-4/10 text-funnel-4 rounded-lg font-bold text-sm">{s.vendaGanha}</span>
                  </td>
                  <td className="text-center"><span className="font-bold text-accent">{rate}%</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
