import { LeadOrigin } from "@/hooks/useGhlData";
import { Trophy } from "lucide-react";
import { SectionTooltip } from "./SectionTooltip";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "hsl(33, 98%, 51%)",
  "hsl(4, 98%, 54%)",
  "hsl(142, 76%, 36%)",
  "hsl(221, 83%, 53%)",
  "hsl(262, 52%, 47%)",
  "hsl(45, 93%, 47%)",
  "hsl(340, 65%, 47%)",
  "hsl(0, 0%, 60%)",
];

interface WonOriginsProps {
  distribution: LeadOrigin[];
  fillRate: number;
  totalWon: number;
  configured: boolean;
}

export function WonOrigins({ distribution, fillRate, totalWon, configured }: WonOriginsProps) {
  if (!configured) {
    return (
      <div className="dashboard-section animate-slide-up h-full">
        <h2 className="section-title">
          <Trophy className="w-5 h-5 text-primary-ink" />
          Origem das vendas
        </h2>
        <p className="text-sm text-muted-foreground text-center py-8">
          Configure o campo UTM Source nas configurações para visualizar de onde vêm suas vendas.
        </p>
      </div>
    );
  }

  const chartData = distribution.map((o) => ({ name: o.name, value: o.count }));
  const topThree = distribution.slice(0, 3);

  return (
    <div className="dashboard-section animate-slide-up h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title mb-0">
          <Trophy className="w-5 h-5 text-primary-ink" />
          Origem das vendas
          <SectionTooltip text="De qual plataforma (UTM Source) vieram as oportunidades ganhas no período. Útil pra identificar canais mais rentáveis." />
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground hidden sm:inline">Preenchido:</span>
          <span className={`font-bold tabular-nums ${fillRate > 50 ? "text-success" : "text-warning-ink"}`}>
            {fillRate.toFixed(1)}%
          </span>
        </div>
      </div>

      {distribution.length === 0 ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-muted-foreground text-sm text-center">
            {totalWon === 0
              ? "Nenhuma venda ganha no período."
              : "Nenhuma venda com UTM Source preenchido no período."}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-6">
          <div className="w-1/2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--raio-md)",
                    boxShadow: "var(--shadow-2)",
                    fontSize: 13,
                  }}
                  formatter={(v: number) => [`${v} vendas`, "Quantidade"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="w-1/2 space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Top fontes</p>
            {topThree.map((o, i) => (
              <div key={o.name} className="flex items-center justify-between p-2 bg-secondary/40 rounded-[var(--raio-md)]">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs font-semibold truncate">{o.name}</span>
                </div>
                <span className="text-xs font-bold text-foreground tabular-nums ml-2 shrink-0">
                  {o.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
            {distribution.length > 3 && (
              <p className="text-[11px] text-muted-foreground pt-1">
                +{distribution.length - 3} outras fontes
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
