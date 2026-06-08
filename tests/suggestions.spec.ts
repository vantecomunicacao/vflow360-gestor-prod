import { test, expect } from "@playwright/test";
import { installSupabaseMocks, loginAs } from "./helpers/supabaseMock";
import { suggestions } from "./helpers/fixtures";

// Fluxo do vendedor na página de Sugestões — o único lugar que ele acessa.

test.describe("Fluxo de Sugestões (vendedor)", () => {
  test.beforeEach(async ({ page }) => {
    await installSupabaseMocks(page, { role: "vendedor" });
    await loginAs(page, "vendedor");
  });

  test("lista os contatos das sugestões atribuídas", async ({ page }) => {
    // Os contatos das sugestões mockadas aparecem agrupados
    await expect(page.getByText(suggestions[0].action_data.contact_name!)).toBeVisible();
    await expect(page.getByText(suggestions[1].action_data.contact_name!)).toBeVisible();
  });

  test("filtro de busca afunila os contatos exibidos", async ({ page }) => {
    const search = page.getByPlaceholder(/buscar/i);
    await expect(search).toBeVisible();

    await search.fill("João");
    await expect(page.getByText("João Cliente")).toBeVisible();
    await expect(page.getByText("Maria Lead")).toHaveCount(0);
  });

  test("estado vazio aparece quando não há sugestões", async ({ page }) => {
    // Re-mocka a tabela de sugestões para devolver vazio e recarrega
    await page.route("**/rest/v1/suggestions**", (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
        body: "[]",
      });
    });
    await page.reload();

    await expect(page.getByText(/nenhuma sugestão encontrada/i)).toBeVisible();
  });
});
