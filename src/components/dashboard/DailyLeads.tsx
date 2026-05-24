import { DailyLead } from "@/hooks/useGhlData";
import { BarChart3, TrendingUp, Calendar, ArrowUp } from "lucide-react";
import { SectionTooltip } from "./SectionTooltip";
import { ComposedChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

interface DailyLeadsProps { dailyLeads: DailyLead[]; }

export function DailyLeads({ dailyLeads }: DailyLeadsProps) {
  const data = dailyLeads || [];
  if (data.length === 0) {
    return (
      <div className="dashboard-section animate-slide-up">
        <h2 className="section-title">
          <BarChart3 className="w-5 h-5 text-primary-ink" />
          Entrada de Oportunidades — Últimos 7 dias
        </h2>
        <p className="text-muted-foreground text-center py-8">Sem dados disponíveis.</p>
      </div>
    );
  }

  const totalWeek = data.reduce((s, d) => s + d.count, 0);
  const avgPerDay = totalWeek / (data.length || 1);
  const maxDay = data.reduce((m, d) => (d.count > m.count ? d : m), data[0]);
  const today = data[data.length - 1];
  const yesterday = data.length > 1 ? data[data.length - 2] : null;
  const todayVsYesterday = yesterday && yesterday.count > 0
    ? ((today.count - yesterday.count) / yesterday.count) * 100
    : 0;
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const formatDate = (s: string) => {
    const d = new Date(s + "T12:00:00Z");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 dashboard-section animate-slide-up">
        <h2 className="section-title">
          <BarChart3 className="w-5 h-5 text-primary-ink" />
          Entrada de Oportunidades — Últimos 7 dias
          <SectionTooltip text="Volume diário de novas oportunidades. A linha mostra a tendência ao longo do período." />
        </h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} barCategoryGap="25%">
              <XAxis dataKey="dayName" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12, fontWeight: 500 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "16px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}
                formatter={(v: number, n: string) => [`${v} opps`, n === "count" ? "Entrada" : "Tendência"]}
                labelFormatter={(label, payload) => payload?.[0]?.payload?.date ? formatDate(payload[0].payload.date) : label}
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.count === maxCount ? "hsl(var(--funnel-3))" : "hsl(var(--primary))"} opacity={0.9} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="count" stroke="hsl(var(--funnel-3))" strokeWidth={2.5} dot={{ fill: "hsl(var(--funnel-3))", r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }} activeDot={{ r: 6 }} name="trend" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="dashboard-section animate-slide-up space-y-4">
        <h2 className="section-title">
          <TrendingUp className="w-5 h-5 text-primary-ink" />
          Insights
        </h2>
        <div className="space-y-3">
          <div className="p-4 bg-secondary/50 rounded-2xl">
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">Total na semana</p>
            <p className="text-2xl font-extrabold text-foreground mt-1">{totalWeek}</p>
            <p className="text-xs text-muted-foreground">opps nos últimos 7 dias</p>
          </div>
          <div className="p-4 bg-secondary/50 rounded-2xl">
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">Média diária</p>
            <p className="text-xl font-extrabold text-foreground mt-1">{avgPerDay.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">opps por dia</p>
          </div>
          <div className="p-4 bg-accent/10 border border-accent/20 rounded-2xl">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUp className="w-3.5 h-3.5 text-primary-ink" />
              <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">Melhor dia</p>
            </div>
            <p className="text-lg font-extrabold text-foreground">{maxDay.dayName} — {formatDate(maxDay.date)}</p>
            <p className="text-xs text-primary-ink font-bold">{maxDay.count} opps</p>
          </div>
          <div className="p-4 bg-secondary/50 rounded-2xl">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">Hoje</p>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-extrabold text-foreground">{today.count} opps</p>
              {yesterday && todayVsYesterday !== 0 && (
                <span className={`text-xs font-bold ${todayVsYesterday > 0 ? "text-success" : "text-destructive"}`}>
                  {todayVsYesterday > 0 ? "+" : ""}{todayVsYesterday.toFixed(0)}%
                </span>
              )}
            </div>
            {yesterday && <p className="text-xs text-muted-foreground">vs ontem: {yesterday.count} opps</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
