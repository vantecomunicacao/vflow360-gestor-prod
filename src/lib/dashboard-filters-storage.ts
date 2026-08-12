import { DateRange } from "react-day-picker";

// Persistência dos filtros do Dashboard por conta (workspace), para que um
// F5 / reabrir a aba devolva a tela exatamente como o usuário deixou.
// Guardado no localStorage e com validade curta: IDs de vendedor/etapa podem
// mudar após um re-sync do GHL, então um estado antigo é descartado em vez de
// filtrar tudo para zero sem pista visível.
const KEY_PREFIX = "vflow360:dashboard-filters:v1:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PersistedDashboardFilters {
  dateRange?: DateRange;
  additionalDateRange?: DateRange;
  additionalDateRange2?: DateRange;
  selectedPipelineId: string | null;
  selectedStageIds: string[];
  selectedSellerIds: string[];
  selectedUtmMedium: string | null;
  selectedUtmCampaign: string | null;
}

const key = (workspaceId: string) => `${KEY_PREFIX}${workspaceId}`;

function serializeRange(range?: DateRange) {
  if (!range?.from) return null;
  return { from: range.from.toISOString(), to: range.to ? range.to.toISOString() : null };
}

function parseRange(raw: unknown): DateRange | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { from, to } = raw as { from?: string; to?: string | null };
  if (!from) return undefined;
  const fromDate = new Date(from);
  if (Number.isNaN(fromDate.getTime())) return undefined;
  const toDate = to ? new Date(to) : undefined;
  return { from: fromDate, to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined };
}

export function saveDashboardFilters(workspaceId: string, filters: PersistedDashboardFilters) {
  try {
    localStorage.setItem(
      key(workspaceId),
      JSON.stringify({
        savedAt: Date.now(),
        dateRange: serializeRange(filters.dateRange),
        additionalDateRange: serializeRange(filters.additionalDateRange),
        additionalDateRange2: serializeRange(filters.additionalDateRange2),
        selectedPipelineId: filters.selectedPipelineId,
        selectedStageIds: filters.selectedStageIds,
        selectedSellerIds: filters.selectedSellerIds,
        selectedUtmMedium: filters.selectedUtmMedium,
        selectedUtmCampaign: filters.selectedUtmCampaign,
      })
    );
  } catch {
    // localStorage cheio ou indisponível: persistir filtros é conveniência, não bloqueia a tela.
  }
}

export function loadDashboardFilters(workspaceId: string): PersistedDashboardFilters | null {
  try {
    const raw = localStorage.getItem(key(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(key(workspaceId));
      return null;
    }
    const dateRange = parseRange(parsed.dateRange);
    if (!dateRange) return null; // sem período válido não vale restaurar nada
    return {
      dateRange,
      additionalDateRange: parseRange(parsed.additionalDateRange),
      additionalDateRange2: parseRange(parsed.additionalDateRange2),
      selectedPipelineId: typeof parsed.selectedPipelineId === "string" ? parsed.selectedPipelineId : null,
      selectedStageIds: Array.isArray(parsed.selectedStageIds) ? parsed.selectedStageIds.filter((v: unknown) => typeof v === "string") : [],
      selectedSellerIds: Array.isArray(parsed.selectedSellerIds) ? parsed.selectedSellerIds.filter((v: unknown) => typeof v === "string") : [],
      selectedUtmMedium: typeof parsed.selectedUtmMedium === "string" ? parsed.selectedUtmMedium : null,
      selectedUtmCampaign: typeof parsed.selectedUtmCampaign === "string" ? parsed.selectedUtmCampaign : null,
    };
  } catch {
    return null;
  }
}

export function clearDashboardFilters(workspaceId: string) {
  try {
    localStorage.removeItem(key(workspaceId));
  } catch {
    // ignorado: ver saveDashboardFilters
  }
}
