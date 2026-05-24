import { LeadOrigin } from "@/hooks/useGhlData";
import { Trophy } from "lucide-react";
import { SectionTooltip } from "./SectionTooltip";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "hsl(160, 60%, 42%)", "hsl(215, 50%, 45%)", "hsl(38, 92%, 50%)", "hsl(262, 52%, 47%)",
  "hsl(340, 65%, 47%)", "hsl(200, 60%, 50%)", "hsl(152, 60%, 45%)", "hsl(0, 0%, 60%)",
];

interface SalesOriginsProps { wonOrigins: LeadOrigin[]; fillRate: number; totalWon: number; }

export function SalesOrigins({ wonOrigins, fillRate }: SalesOriginsProps) {
  const origins = wonOrigins || [];
  const chartData = origins.map((o) => ({ name: o.name, value: o.count }));

  return (
    <div className="dashboard-section animate-slide-up h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title mb-0">
          <Trophy className="w-5 h-5 text-primary-ink" />
          Origem das Vendas
          <SectionTooltip text="Origem das oportunidades ganhas. Útil para identificar canais mais rentáveis." />
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Preenchido:</span>
          <span className={`font-bold ${fillRate > 50 ? "text-success" : "text-warning-ink"}`}>{fillRate.toFixed(1)}%</span>
        </div>
      </div>

      {origins.length === 0 ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-muted-foreground text-sm text-center">Nenhuma venda com origem preenchida no período.</p>
        </div>
      ) : (
        <div className="flex items-center gap-6">
          <div className="w-1/2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "16px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}
                  formatter={(v: number) => [`${v} vendas`, "Quantidade"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="w-1/2 space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
            {origins.map((o, i) => (
              <div key={o.name} className="flex items-center justify-between p-2.5 bg-secondary/40 rounded-xl">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs font-semibold truncate">{o.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs text-muted-foreground">{o.count}</span>
                  <span className="text-xs font-bold text-foreground w-10 text-right">{o.percentage.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
