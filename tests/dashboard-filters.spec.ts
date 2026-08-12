import { test, expect, Page } from "@playwright/test";
import { installSupabaseMocks, loginAs } from "./helpers/supabaseMock";

// Os filtros do Dashboard são persistidos por conta no localStorage, para que
// um reload devolva a tela do jeito que o usuário estava usando.

// Botão de um filtro do header, pelo rótulo do Field (ex.: "Período").
function filterButton(page: Page, label: string) {
  return page
    .locator("header")
    .getByText(label, { exact: true })
    .locator("xpath=..")
    .getByRole("button")
    .first();
}

const periodButton = (page: Page) => filterButton(page, "Período");

test.describe("Persistência dos filtros do Dashboard", () => {
  test("o período escolhido sobrevive ao reload", async ({ page }) => {
    await installSupabaseMocks(page, { role: "gestor" });
    await loginAs(page, "gestor");

    const trigger = periodButton(page);
    await expect(trigger).toBeVisible();

    await trigger.click();
    await page.getByRole("button", { name: "Últimos 30 dias" }).click();

    const chosen = (await trigger.textContent())?.trim();
    expect(chosen).toBeTruthy();

    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(periodButton(page)).toHaveText(chosen!);
  });

  test("o funil escolhido sobrevive ao reload", async ({ page }) => {
    await installSupabaseMocks(page, { role: "gestor" });
    await loginAs(page, "gestor");

    // O filtro de funil é um Select (role combobox), não um botão.
    const funil = page
      .locator("header")
      .getByText("Funil de vendas", { exact: true })
      .locator("xpath=..")
      .getByRole("combobox");
    await expect(funil).toBeVisible();

    await funil.click();
    await page.getByRole("option", { name: "Funil de Vendas" }).click();
    await expect(funil).toContainText("Funil de Vendas");

    await page.reload();
    await expect(
      page.locator("header").getByText("Funil de vendas", { exact: true }).locator("xpath=..").getByRole("combobox"),
    ).toContainText("Funil de Vendas");
  });

  test("grava o estado numa chave por conta e restaura na volta", async ({ page }) => {
    await installSupabaseMocks(page, { role: "gestor" });
    await loginAs(page, "gestor");

    await expect(periodButton(page)).toBeVisible();

    // A gravação só é liberada após a hidratação (que espera o pipeline padrão
    // da conta), então a chave aparece um instante depois do header.
    const readKeys = () =>
      page.evaluate(() =>
        Object.keys(localStorage).filter((k) => k.startsWith("vflow360:dashboard-filters:v1:")),
      );
    await expect.poll(async () => (await readKeys()).length).toBe(1);
    const keys = await readKeys();

    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), keys[0]);
    expect(typeof saved.savedAt).toBe("number");
    expect(saved.dateRange?.from).toBeTruthy();
  });
});
