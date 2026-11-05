import { test, expect, type Request } from "@playwright/test";
import { installSupabaseMocks, loginAs } from "./helpers/supabaseMock";

// Tela "Meu desempenho" (vendedor): qualidade de preenchimento, tempo de
// resposta e lista de leads com campos vazios. O escopo do vendedor é do
// servidor; aqui garantimos que a tela pede o modo certo e não manda vendedor.

test.describe("Meu desempenho (vendedor)", () => {
  test("vendedor abre pela sidebar e vê só os blocos da tela", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await installSupabaseMocks(page, { role: "vendedor" });
    await loginAs(page, "vendedor");

    const dashboardCalls: Request[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/functions/v1/ghl-dashboard")) dashboardCalls.push(r);
    });

    await page.getByRole("link", { name: "Meu desempenho" }).click();
    await expect(page).toHaveURL(/\/my-performance$/);

    await expect(page.getByRole("heading", { name: "Meu desempenho" })).toBeVisible();
    await expect(page.getByText("Seus leads como Vendedor Teste")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Qualidade de Preenchimento/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Tempo médio de resposta/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Leads com campos vazios/ })).toBeVisible();

    // Lista abre em "só em aberto": o lead ganho fica de fora até desligar.
    await expect(page.getByText("Fazenda Boa Vista")).toBeVisible();
    await expect(page.getByText("Agro Martins")).toHaveCount(0);
    await page.getByLabel("Só em aberto").click();
    await expect(page.getByText("Agro Martins")).toBeVisible();

    // Filtro por campo
    await page.getByRole("button", { name: /^Cidade · 1$/ }).click();
    await expect(page.getByText("Transportadora Silva")).toBeVisible();
    await expect(page.getByText("Fazenda Boa Vista")).toHaveCount(0);

    // Link para a oportunidade no GHL
    await expect(page.getByRole("link", { name: /Transportadora Silva/ })).toHaveAttribute(
      "href",
      /\/v2\/location\/loc-e2e\/opportunities\/list\?opportunityId=opp-3$/,
    );

    // Sem filtro de vendedor na tela
    await expect(page.getByText("Vendedor", { exact: true })).toHaveCount(0);

    // A tela pede o modo enxuto e nunca escolhe vendedor
    expect(dashboardCalls.length).toBeGreaterThan(0);
    for (const call of dashboardCalls) {
      const body = call.postDataJSON();
      expect(body.view).toBe("my_performance");
      expect(body.sellerIds).toBeUndefined();
    }

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });

  test("mostra a mensagem do servidor quando o usuário não tem vínculo", async ({ page }) => {
    await installSupabaseMocks(page, { role: "vendedor" });
    // Registrada depois = prioridade maior que o mock genérico.
    await page.route("**/functions/v1/ghl-dashboard**", (route) => {
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization,apikey,content-type,x-client-info",
        "content-type": "application/json",
      };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers, body: "" });
      return route.fulfill({
        status: 403,
        headers,
        body: JSON.stringify({ error: "Seu usuário não está vinculado a um vendedor do GHL nesta conta." }),
      });
    });
    await loginAs(page, "vendedor");

    await page.getByRole("link", { name: "Meu desempenho" }).click();
    await expect(page.getByText("Seu usuário não está vinculado a um vendedor do GHL nesta conta.")).toBeVisible();
  });
});

test.describe("Meu desempenho (gestor)", () => {
  test("admin não vê o item e é mandado para o Dashboard", async ({ page }) => {
    await installSupabaseMocks(page, { role: "gestor" });
    await loginAs(page, "gestor");

    await expect(page.getByRole("link", { name: "Meu desempenho" })).toHaveCount(0);

    // Navegação client-side (sem reload) até a rota protegida.
    await page.evaluate(() => {
      window.history.pushState({}, "", "/my-performance");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
