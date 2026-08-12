import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveDashboardFilters,
  loadDashboardFilters,
  clearDashboardFilters,
  type PersistedDashboardFilters,
} from "./dashboard-filters-storage";

const WS = "ws-1";
const KEY = `vflow360:dashboard-filters:v1:${WS}`;

const sample: PersistedDashboardFilters = {
  dateRange: { from: new Date("2026-08-01T00:00:00.000Z"), to: new Date("2026-08-07T23:59:59.000Z") },
  additionalDateRange: { from: new Date("2026-07-01T00:00:00.000Z"), to: new Date("2026-07-07T00:00:00.000Z") },
  additionalDateRange2: undefined,
  selectedPipelineId: "pipe-1",
  selectedStageIds: ["stage-a", "stage-b"],
  selectedSellerIds: ["seller-1"],
  selectedUtmMedium: "cpc",
  selectedUtmCampaign: null,
};

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("dashboard-filters-storage", () => {
  it("faz round-trip dos filtros, preservando datas", () => {
    saveDashboardFilters(WS, sample);
    const loaded = loadDashboardFilters(WS);

    expect(loaded).not.toBeNull();
    expect(loaded!.dateRange?.from?.toISOString()).toBe(sample.dateRange!.from!.toISOString());
    expect(loaded!.dateRange?.to?.toISOString()).toBe(sample.dateRange!.to!.toISOString());
    expect(loaded!.additionalDateRange?.from?.toISOString()).toBe(sample.additionalDateRange!.from!.toISOString());
    expect(loaded!.additionalDateRange2).toBeUndefined();
    expect(loaded!.selectedPipelineId).toBe("pipe-1");
    expect(loaded!.selectedStageIds).toEqual(["stage-a", "stage-b"]);
    expect(loaded!.selectedSellerIds).toEqual(["seller-1"]);
    expect(loaded!.selectedUtmMedium).toBe("cpc");
    expect(loaded!.selectedUtmCampaign).toBeNull();
  });

  it("preserva um período de um dia só (sem 'to')", () => {
    saveDashboardFilters(WS, { ...sample, dateRange: { from: new Date("2026-08-05T00:00:00.000Z"), to: undefined } });
    const loaded = loadDashboardFilters(WS);
    expect(loaded!.dateRange?.from?.toISOString()).toBe("2026-08-05T00:00:00.000Z");
    expect(loaded!.dateRange?.to).toBeUndefined();
  });

  it("isola contas diferentes", () => {
    saveDashboardFilters(WS, sample);
    expect(loadDashboardFilters("ws-2")).toBeNull();
  });

  it("retorna null quando não há nada salvo", () => {
    expect(loadDashboardFilters(WS)).toBeNull();
  });

  it("descarta e limpa estado com mais de 24h", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
    saveDashboardFilters(WS, sample);

    vi.setSystemTime(new Date("2026-08-11T11:00:00.000Z")); // 23h depois
    expect(loadDashboardFilters(WS)).not.toBeNull();

    vi.setSystemTime(new Date("2026-08-11T13:00:00.000Z")); // 25h depois
    expect(loadDashboardFilters(WS)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("ignora JSON corrompido em vez de quebrar", () => {
    localStorage.setItem(KEY, "{nao é json");
    expect(loadDashboardFilters(WS)).toBeNull();
  });

  it("ignora estado sem período válido", () => {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), dateRange: { from: "data-invalida" }, selectedStageIds: [] }));
    expect(loadDashboardFilters(WS)).toBeNull();
  });

  it("saneia campos com tipos inesperados", () => {
    localStorage.setItem(KEY, JSON.stringify({
      savedAt: Date.now(),
      dateRange: { from: "2026-08-01T00:00:00.000Z", to: null },
      selectedStageIds: ["ok", 42, null],
      selectedSellerIds: "não é array",
      selectedPipelineId: 99,
      selectedUtmMedium: { a: 1 },
    }));

    const loaded = loadDashboardFilters(WS)!;
    expect(loaded.selectedStageIds).toEqual(["ok"]);
    expect(loaded.selectedSellerIds).toEqual([]);
    expect(loaded.selectedPipelineId).toBeNull();
    expect(loaded.selectedUtmMedium).toBeNull();
  });

  it("clearDashboardFilters apaga só a conta indicada", () => {
    saveDashboardFilters(WS, sample);
    saveDashboardFilters("ws-2", sample);
    clearDashboardFilters(WS);
    expect(loadDashboardFilters(WS)).toBeNull();
    expect(loadDashboardFilters("ws-2")).not.toBeNull();
  });

  it("não lança quando o localStorage falha (ex.: cota cheia)", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => saveDashboardFilters(WS, sample)).not.toThrow();
    spy.mockRestore();
  });
});
