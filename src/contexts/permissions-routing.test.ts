import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { isRestricted, landingPath, Permissions } from "./PermissionsContext";

const none: Permissions = {
  viewSuggestions: false,
  viewIntegrations: false,
  viewSettings: false,
  viewAllCoolingLeads: false,
  viewMyPerformance: false,
  isAdmin: false,
};

// Rotas e a permissão que cada PermissionGuard exige (espelha App.tsx).
const guards: Record<string, (p: Permissions) => boolean> = {
  "/suggestions": (p) => p.viewSuggestions,
  "/cooling-leads": (p) => p.viewSuggestions || p.viewAllCoolingLeads,
  "/my-performance": (p) => p.viewMyPerformance,
};

describe("permissões: Meu desempenho", () => {
  it("só Meu desempenho deixa o usuário restrito e cai na tela dele", () => {
    const p = { ...none, viewMyPerformance: true };
    expect(isRestricted(p)).toBe(true);
    expect(landingPath(p)).toBe("/my-performance");
  });

  it("vendedor padrão (sugestões + meu desempenho) continua abrindo em Sugestões", () => {
    const p = { ...none, viewSuggestions: true, viewMyPerformance: true };
    expect(landingPath(p)).toBe("/suggestions");
  });

  it("quem tem Configurações segue como gestor mesmo com Meu desempenho", () => {
    const p = { ...none, viewSettings: true, viewMyPerformance: true };
    expect(isRestricted(p)).toBe(false);
    expect(landingPath(p)).toBe("/dashboard");
  });

  it("o destino de todo usuário restrito é liberado pelo guard da rota (sem loop)", () => {
    const flags = ["viewSuggestions", "viewAllCoolingLeads", "viewMyPerformance"] as const;
    for (let mask = 1; mask < 1 << flags.length; mask++) {
      const p = { ...none };
      flags.forEach((f, i) => { if (mask & (1 << i)) p[f] = true; });
      const dest = landingPath(p);
      expect(guards[dest], `destino ${dest} sem guard conhecido`).toBeDefined();
      expect(guards[dest](p), `máscara ${mask} cai em ${dest} sem permissão`).toBe(true);
    }
  });
});
