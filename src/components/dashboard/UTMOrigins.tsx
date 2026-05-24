import { useState } from "react";
import { LeadOrigin } from "@/hooks/useGhlData";
import { Compass, Settings as SettingsIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { SectionTooltip } from "./SectionTooltip";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "hsl(33, 98%, 51%)",   // laranja-700 (marca)
  "hsl(4, 98%, 54%)",    // laranja-500 (vermelho-marca)
  "hsl(221, 83%, 53%)",  // info
  "hsl(142, 76%, 36%)",  // sucesso
  "hsl(262, 52%, 47%)",  // roxo
  "hsl(45, 93%, 47%)",   // âmbar
  "hsl(340, 65%, 47%)",  // rosa
  "hsl(200, 60%, 50%)",  // ciano
  "hsl(0, 0%, 60%)",     // cinza
];

type Dimension = "source" | "medium" | "campaign";

interface UTMOriginsProps {
  source: { distribution: LeadOrigin[]; fillRate: number };
  medium: { distribution: LeadOrigin[]; fillRate: number };
  campaign: { distribution: LeadOrigin[]; fillRate: number };
  configured: { source: boolean; medium: boolean; campaign: boolean };
  /** Quando setados, indicam filtros ativos vindos do Dashboard. */
  activeMedium?: string | null;
  activeCampaign?: string | null;
  /** Clicar numa fatia aplica filtro (drill-down). */
  onSelectMedium?: (value: string | null) => void;
  onSelectCampaign?: (value: string | null) => void;
}

const DIM_LABELS: Record<Dimension, string> = {
  source: "Source",
  medium: "Medium",
  campaign: "Campaign",
};

const DIM_HINTS: Record<Dimension, string> = {
  source: "Plataforma de origem (google, facebook, instagram...)",
  medium: "Tipo de mídia (cpc, social, organic, email...)",
  campaign: "Campanha específica que trouxe o lead",
};

export function UTMOrigins({
  source,
  medium,
  campaign,
  configured,
  activeMedium,
  activeCampaign,
  onSelectMedium,
  onSelectCampaign,
}: UTMOriginsProps) {
  // Default na primeira dimensão configurada
  const firstConfigured: Dimension =
    configured.source ? "source" : configured.medium ? "medium" : "campaign";
  const [dim, setDim] = useState<Dimension>(firstConfigured);

  const dataByDim = { source, medium, campaign };
  const active = dataByDim[dim];
  const items = active.distribution || [];
  const chartData = items.map((o) => ({ name: o.name, value: o.count }));

  // Drill-down: apenas medium e campaign aplicam filtro (source não tem filtro no header)
  const activeFilter = dim === "medium" ? activeMedium : dim === "campaign" ? activeCampaign : null;
  const handleSelect = (name: string) => {
    if (dim === "medium" && onSelectMedium) {
      onSelectMedium(activeMedium === name ? null : name);
    } else if (dim === "campaign" && onSelectCampaign) {
      onSelectCampaign(activeCampaign === name ? null : name);
    }
  };
  const canDrill = dim !== "source";

  // Nenhum UTM configurado: estado vazio com CTA
  if (!configured.source && !configured.medium && !configured.campaign) {
    return (
      <div className="dashboard-section animate-slide-up">
        <h2 className="section-title">
          <Compass className="w-5 h-5 text-primary-ink" />
          Origem dos leads — UTM
        </h2>
        <div className="flex flex-col items-center justify-center text-center py-10 gap-3">
          <p className="text-sm text-muted-foreground max-w-md">
            Mapeie os campos UTM nas configurações para visualizar a origem dos leads por Source, Medium e Campaign.
          </p>
          <Link
            to="/settings/dashboard"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary-ink hover:underline"
          >
            <SettingsIcon className="w-4 h-4" />
            Configurar campos UTM
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-section animate-slide-up">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="section-title mb-0">
          <Compass className="w-5 h-5 text-primary-ink" />
          Origem dos leads — UTM
          <SectionTooltip text="Distribuição das oportunidades por parâmetro UTM. Use o toggle para alternar entre Source (plataforma), Medium (tipo de mídia) e Campaign (campanha). Clique numa fatia de Medium ou Campaign pra filtrar o dashboard." />
        </h2>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:inline">Preenchido:</span>
          <span className="text-xs font-bold text-foreground tabular-nums">{active.fillRate.toFixed(1)}%</span>

          {/* Toggle de 3 dimensões */}
          <div className="inline-flex rounded-md border border-border bg-card p-0.5" role="tablist" aria-label="Dimensão UTM">
            {(["source", "medium", "campaign"] as const).map((d) => {
              const isActive = dim === d;
              const isConfigured = configured[d];
              return (
                <button
                  key={d}
                  role="tab"
                  aria-selected={isActive}
                  disabled={!isConfigured}
                  onClick={() => setDim(d)}
                  className={
                    "px-3 h-7 text-xs font-medium rounded-[var(--raio-sm)] transition-colors " +
                    (isActive
                      ? "gradient-primary text-white shadow-[var(--shadow-1)]"
                      : isConfigured
                        ? "text-muted-foreground hover:text-foreground hover:bg-muted"
                        : "text-muted-foreground/40 cursor-not-allowed")
                  }
                  title={isConfigured ? DIM_HINTS[d] : `${DIM_LABELS[d]} não configurado`}
                >
                  {DIM_LABELS[d]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {!configured[dim] ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-sm text-muted-foreground">
            UTM {DIM_LABELS[dim]} não configurado.{" "}
            <Link to="/settings/dashboard" className="text-primary-ink hover:underline">Configurar</Link>
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-sm text-muted-foreground text-center">
            Nenhum valor de UTM {DIM_LABELS[dim]} preenchido no período.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
          <div className="lg:col-span-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                  onClick={canDrill ? (e: any) => handleSelect(e.name) : undefined}
                  cursor={canDrill ? "pointer" : "default"}
                >
                  {chartData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={COLORS[i % COLORS.length]}
                      opacity={activeFilter && activeFilter !== chartData[i].name ? 0.35 : 1}
                    />
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
                  formatter={(v: number) => [`${v} opps`, "Quantidade"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="lg:col-span-3 space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
            {items.map((o, i) => {
              const isSelected = activeFilter === o.name;
              const isFaded = activeFilter && !isSelected;
              return (
                <button
                  key={o.name}
                  type="button"
                  onClick={canDrill ? () => handleSelect(o.name) : undefined}
                  disabled={!canDrill}
                  className={
                    "w-full flex items-center justify-between p-2.5 rounded-[var(--raio-md)] text-left transition-colors " +
                    (canDrill ? "cursor-pointer hover:bg-muted/60 " : "cursor-default ") +
                    (isSelected ? "bg-primary/10 border border-primary/30 " : "bg-secondary/40 border border-transparent ") +
                    (isFaded ? "opacity-60 " : "")
                  }
                  aria-pressed={isSelected}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="text-xs font-semibold truncate">{o.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="text-xs text-muted-foreground tabular-nums">{o.count}</span>
                    <span className="text-xs font-bold text-foreground tabular-nums w-12 text-right">
                      {o.percentage.toFixed(1)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeFilter && canDrill && (
        <div className="mt-3 flex items-center justify-between rounded-[var(--raio-md)] bg-primary/5 border border-primary/20 px-3 py-2">
          <span className="text-xs text-foreground">
            Filtrando dashboard por <strong>{DIM_LABELS[dim]}: {activeFilter}</strong>
          </span>
          <button
            type="button"
            onClick={() => handleSelect(activeFilter)}
            className="text-xs font-medium text-primary-ink hover:underline"
          >
            Limpar filtro
          </button>
        </div>
      )}
    </div>
  );
}
