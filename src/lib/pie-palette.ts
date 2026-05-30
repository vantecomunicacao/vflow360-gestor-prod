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
