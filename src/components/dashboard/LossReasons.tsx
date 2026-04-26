import { LossReason } from "@/hooks/useGhlData";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { XCircle } from "lucide-react";
import { SectionTooltip } from "./SectionTooltip";

interface LossReasonsProps { lossReasons: LossReason[]; totalLost: number; }

const COLORS = [
  "hsl(var(--destructive))", "hsl(var(--warning))", "hsl(var(--primary))", "hsl(var(--accent))",
  "hsl(var(--muted-foreground))", "hsl(var(--success))", "hsl(220, 70%, 55%)", "hsl(280, 60%, 50%)",
];

export function LossReasons({ lossReasons, totalLost }: LossReasonsProps) {
  const data = lossReasons.map((lr) => ({ name: lr.reason, value: lr.count }));
  const filledCount = lossReasons.filter((lr) => lr.reason !== "Não informado").reduce((s, lr) => s + lr.count, 0);
  const fillRate = totalLost > 0 ? ((filledCount / totalLost) * 100).toFixed(1) : "0.0";

  return (
    <div className="dashboard-section animate-slide-up">
      <div className="flex items-center justify-between mb-6">
        <h2 className="section-title mb-0">
          <XCircle className="w-5 h-5 text-destructive" />
          Motivos de Perda
          <SectionTooltip text="Distribuição dos motivos para oportunidades marcadas como Perdidas." />
        </h2>
        <div className="px-4 py-2 rounded-2xl text-sm font-bold border bg-destructive/5 border-destructive/10 text-destructive">
          Preenchido: {fillRate}%
        </div>
      </div>

      {data.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">Nenhuma oportunidade perdida no período.</p>
      ) : (
        <div className="flex flex-col items-center">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={3} dataKey="value" nameKey="name" stroke="none">
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "13px" }}
                formatter={(v: number, n: string) => [`${v} opps`, n]}
              />
              <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">Total perdidas: <span className="font-bold">{totalLost}</span></p>
        </div>
      )}
    </div>
  );
}
