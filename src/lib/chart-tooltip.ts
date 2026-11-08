import type { CSSProperties } from "react";

/**
 * Estilo padrão dos tooltips do Recharts, ligado aos tokens do tema.
 *
 * Por que `itemStyle`/`labelStyle`: o Recharts pinta o texto de cada item com
 * `entry.color || "#000"`. Em gráficos de pizza (e em barras coloridas só via
 * <Cell>) essa cor não existe, então o texto saía preto — ilegível no tema
 * escuro. Aqui o texto do tooltip sempre usa a cor de texto do tema.
 *
 * Uso: `<Tooltip {...chartTooltipProps} formatter={...} />`
 */
const contentStyle: CSSProperties = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--raio-md)",
  boxShadow: "var(--shadow-2)",
  fontSize: 13,
};

const itemStyle: CSSProperties = { color: "hsl(var(--popover-foreground))" };

const labelStyle: CSSProperties = { color: "hsl(var(--popover-foreground))", fontWeight: 600 };

export const chartTooltipProps = { contentStyle, itemStyle, labelStyle };

/** Linha-guia vertical do hover em gráficos cartesianos (padrão do Recharts é #ccc, estoura no escuro). */
export const chartCursorStyle = { stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.35 };
