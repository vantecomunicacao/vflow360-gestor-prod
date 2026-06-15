import { OUTRAS_LABEL, NAO_IDENTIFICADO_LABEL, NAO_INFORMADO_LABEL } from "@/lib/group-top-n";

export const PIE_COLORS = [
  "hsl(33, 98%, 51%)",
  "hsl(4, 98%, 54%)",
  "hsl(142, 76%, 36%)",
  "hsl(221, 83%, 53%)",
  "hsl(262, 52%, 47%)",
  "hsl(45, 93%, 47%)",
];

export const OUTRAS_COLOR = "hsl(0, 0%, 75%)";
export const FALLBACK_COLOR = "hsl(0, 0%, 45%)";

const FALLBACK_LABELS: ReadonlySet<string> = new Set([NAO_IDENTIFICADO_LABEL, NAO_INFORMADO_LABEL]);

export function getPieColor(name: string, index: number): string {
  if (FALLBACK_LABELS.has(name)) return FALLBACK_COLOR;
  if (name === OUTRAS_LABEL) return OUTRAS_COLOR;
  return PIE_COLORS[index % PIE_COLORS.length];
}

/**
 * Constrói um mapa nome→cor estável a partir de uma ou mais distribuições, para
 * que a MESMA origem receba a MESMA cor em gráficos diferentes (ex: origem dos
 * leads e origem das vendas). A ordem de prioridade segue a ordem em que os
 * nomes aparecem nas distribuições passadas. Labels especiais (Outras / Não
 * identificado) mantêm suas cores fixas e não consomem a paleta.
 */
export function buildPieColorMap(...distributions: { name: string }[][]): Record<string, string> {
  const map: Record<string, string> = {};
  let paletteIndex = 0;
  for (const dist of distributions) {
    for (const { name } of dist) {
      if (name in map) continue;
      if (FALLBACK_LABELS.has(name)) { map[name] = FALLBACK_COLOR; continue; }
      if (name === OUTRAS_LABEL) { map[name] = OUTRAS_COLOR; continue; }
      map[name] = PIE_COLORS[paletteIndex % PIE_COLORS.length];
      paletteIndex++;
    }
  }
  return map;
}
