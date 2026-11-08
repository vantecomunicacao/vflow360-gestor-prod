import { PieChart as PieIcon } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CustomFieldDistribution } from "@/hooks/useGhlData";
import { SectionTooltip } from "./SectionTooltip";
import { getPieColor, OUTRAS_COLOR } from "@/lib/pie-palette";
import { chartTooltipProps } from "@/lib/chart-tooltip";

interface CustomFieldChartsProps {
  fields: CustomFieldDistribution[];
}

const MAX_SLICES = 6;
const OUTROS_LABEL = "Outros";

// Mesma paleta das demais pizzas do dashboard. A paleta antiga usava tokens de
// interface (--accent, --secondary-foreground) como cor de dado: no tema escuro
// uma fatia saía marrom quase preta, e no claro outra saía preta.
function sliceColor(name: string, index: number): string {
  return name === OUTROS_LABEL ? OUTRAS_COLOR : getPieColor(name, index);
}

function compactDistribution(dist: CustomFieldDistribution["distribution"]) {
  if (dist.length <= MAX_SLICES) return dist;
  const head = dist.slice(0, MAX_SLICES - 1);
  const tail = dist.slice(MAX_SLICES - 1);
  const otherCount = tail.reduce((a, b) => a + b.count, 0);
  const otherPct = tail.reduce((a, b) => a + b.percentage, 0);
  return [...head, { name: OUTROS_LABEL, count: otherCount, percentage: otherPct }];
}

export function CustomFieldCharts({ fields }: CustomFieldChartsProps) {
  if (!fields || fields.length === 0) return null;

  return (
    <div className="dashboard-section animate-slide-up">
      <h2 className="section-title">
        <PieIcon className="w-5 h-5 text-primary-ink" />
        Distribuição de Campos Personalizados
        <SectionTooltip text="Distribuição dos valores nos campos personalizados selecionados nas configurações." />
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-4">
        {fields.map((f) => {
          const data = compactDistribution(f.distribution);
          const hasData = data.length > 0;
          const chartDescription = hasData
            ? `Distribuição do campo ${f.name}: ${data.slice(0, 3).map((d) => `${d.name} ${d.percentage.toFixed(0)}%`).join(", ")}.`
            : `Distribuição do campo ${f.name}: sem dados.`;
          return (
            <div key={f.key} className="border rounded-2xl p-3 bg-card/50">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-xs font-semibold truncate" title={f.name}>{f.name}</h3>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {f.filledCount}/{f.totalLeads}
                </span>
              </div>

              {!hasData ? (
                <p className="text-xs text-muted-foreground text-center py-6">Sem dados</p>
              ) : (
                <>
                  <div className="h-28" role="img" aria-label={chartDescription}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data}
                          dataKey="count"
                          nameKey="name"
                          innerRadius={22}
                          outerRadius={45}
                          paddingAngle={2}
                          stroke="hsl(var(--background))"
                          strokeWidth={1}
                        >
                          {data.map((d, i) => (
                            <Cell key={i} fill={sliceColor(d.name, i)} />
                          ))}
                        </Pie>
                        <Tooltip
                          {...chartTooltipProps}
                          contentStyle={{ ...chartTooltipProps.contentStyle, fontSize: 11, padding: "4px 8px" }}
                          formatter={(value: number, name: string) => [`${value}`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <ul className="mt-1 space-y-0.5">
                    {data.slice(0, 4).map((d, i) => (
                      <li key={d.name} className="flex items-center gap-1.5 text-[11px] leading-tight">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: sliceColor(d.name, i) }}
                        />
                        <span className="truncate flex-1" title={d.name}>{d.name}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {d.percentage.toFixed(0)}%
                        </span>
                      </li>
                    ))}
                    {data.length > 4 && (
                      <li className="text-[10px] text-muted-foreground pl-3.5">
                        +{data.length - 4} outros
                      </li>
                    )}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
