import { test, expect, type Page, type Request } from "@playwright/test";
import { installSupabaseMocks, loginAs } from "./helpers/supabaseMock";
import { myPerformanceData } from "./helpers/fixtures";

// Tela "Meu desempenho" (vendedor): qualidade de preenchimento, tempo de
// resposta e lista de leads com campos vazios. Quem decide o escopo é o
// servidor: usuário vinculado ao GHL fica travado no vendedor dele; sem
// vínculo (login compartilhado por vários vendedores) escolhe no filtro.

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,apikey,content-type,x-client-info",
  "content-type": "application/json",
};

/** Sobrescreve a resposta do ghl-dashboard (registrada depois = prioridade). */
async function mockDashboard(page: Page, status: number, body: unknown) {
  await page.route("**/functions/v1/ghl-dashboard**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS, body: "" });
    return route.fulfill({ status, headers: CORS, body: JSON.stringify(body) });
  });
}

function trackDashboardCalls(page: Page): Request[] {
  const calls: Request[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/functions/v1/ghl-dashboard")) calls.push(r);
  });
  return calls;
}

test.describe("Meu desempenho (login compartilhado, sem vínculo)", () => {
  test("abre com todos os vendedores e deixa escolher um", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await installSupabaseMocks(page, { role: "vendedor" });
    await loginAs(page, "vendedor");
    const calls = trackDashboardCalls(page);

    await page.getByRole("link", { name: "Meu desempenho" }).click();
    await expect(page).toHaveURL(/\/my-performance$/);

    await expect(page.getByRole("heading", { name: "Meu desempenho" })).toBeVisible();
    await expect(page.getByText("Todos os vendedores · 12 oportunidades no período")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Qualidade de Preenchimento/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Tempo médio de resposta/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Leads com campos vazios/ })).toBeVisible();

    // Com vários vendedores na tela, cada lead mostra de quem é.
    await expect(page.getByText("Proposta Enviada · Vendedor Teste")).toBeVisible();

    // Escolhe o vendedor (o filtro aplica ao fechar o menu).
    await page.getByRole("button", { name: "Vendedor", exact: true }).click();
    await page.getByRole("button", { name: "Bruno Lima" }).click();
    await page.keyboard.press("Escape");

    await expect(page.getByText("Leads de Bruno Lima · 12 oportunidades no período")).toBeVisible();
    await expect(page.getByRole("button", { name: "Bruno Lima" })).toBeVisible();
    // Um vendedor só: a linha volta a mostrar só a etapa.
    await expect(page.getByText("Proposta Enviada · Vendedor Teste")).toHaveCount(0);

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call.postDataJSON().view).toBe("my_performance");
    const last = calls[calls.length - 1].postDataJSON();
    expect(last.sellerIds).toEqual(["ghlu-2"]);

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });

  test("lista de pendências: só em aberto, filtro por campo e link do GHL", async ({ page }) => {
    await installSupabaseMocks(page, { role: "vendedor" });
    await loginAs(page, "vendedor");
    await page.getByRole("link", { name: "Meu desempenho" }).click();

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
  });
});

test.describe("Meu desempenho (usuário vinculado ao GHL)", () => {
  test("fica travado no próprio vendedor, sem escolha", async ({ page }) => {
    await installSupabaseMocks(page, { role: "vendedor" });
    await mockDashboard(page, 200, myPerformanceData(null, { locked: true }));
    await loginAs(page, "vendedor");

    await page.getByRole("link", { name: "Meu desempenho" }).click();
    await expect(page.getByText("Seus leads como Vendedor Teste · 12 oportunidades no período")).toBeVisible();

    // Nome fixo no lugar do filtro, sem menu para trocar de vendedor.
    await expect(page.getByTitle("Você vê só os leads do vendedor vinculado ao seu usuário")).toContainText("Vendedor Teste");
    await expect(page.getByRole("button", { name: /Vendedor/ })).toHaveCount(0);
    // Um vendedor só: a linha não repete o nome dele.
    await expect(page.getByText("Proposta Enviada · Vendedor Teste")).toHaveCount(0);
  });

  test("mostra a mensagem do servidor quando a tela é negada", async ({ page }) => {
    await installSupabaseMocks(page, { role: "vendedor" });
    await mockDashboard(page, 403, { error: "Você não tem acesso à tela Meu desempenho." });
    await loginAs(page, "vendedor");

    await page.getByRole("link", { name: "Meu desempenho" }).click();
    await expect(page.getByText("Você não tem acesso à tela Meu desempenho.")).toBeVisible();
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
