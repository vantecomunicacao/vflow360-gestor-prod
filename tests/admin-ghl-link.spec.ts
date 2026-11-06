import { test, expect, type Page } from "@playwright/test";
import { installSupabaseMocks, loginAs } from "./helpers/supabaseMock";

// Admin → Permissões: o vínculo do usuário com o vendedor do GHL pode ser
// trocado ou removido depois da criação (antes só dava para escolher ao criar).

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,apikey,content-type,x-client-info",
  "content-type": "application/json",
};

const VENDOR = {
  id: "user-vend-shared",
  email: "vendedor@cliente.test",
  full_name: "Vendedores (compartilhado)",
  created_at: "2026-01-01T00:00:00Z",
  last_sign_in_at: null,
  roles: ["user"],
  workspaces: [{ workspace_id: "ws-e2e", role: "member", name: "Conta E2E" }],
  permissions: {
    view_suggestions: true, view_integrations: false, view_settings: false,
    view_all_cooling_leads: false, view_my_performance: true,
  },
  ghl_links: [{ workspace_id: "ws-e2e", ghl_user_id: "ghlu-1" }],
};

/** A página Admin confere o papel em user_roles (o mock genérico devolve vazio). */
async function asAdmin(page: Page) {
  await page.route("**/rest/v1/user_roles**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS, body: "" });
    return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify([{ role: "admin" }]) });
  });
}

test("Permissões: troca o vínculo do GHL para Nenhum (login compartilhado)", async ({ page }) => {
  await installSupabaseMocks(page, { role: "gestor" });
  await asAdmin(page);
  const calls: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/admin-users**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS, body: "" });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push(body);
    const out: Record<string, unknown> =
      body.action === "list_users" ? { users: [VENDOR] }
      : body.action === "list_workspaces" ? { workspaces: [{ id: "ws-e2e", name: "Conta E2E", owner_id: "x" }] }
      : body.action === "list_ghl_users" ? {
        ghl_users: [
          { ghl_id: "ghlu-1", name: "Vendedor Teste", email: null },
          { ghl_id: "ghlu-2", name: "Bruno Lima", email: null },
        ],
      }
      : { ok: true };
    return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(out) });
  });
  await loginAs(page, "gestor");

  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("button", { name: "Permissões" }).click();

  const dialog = page.getByRole("dialog");
  const select = dialog.getByRole("combobox", { name: "Vendedor do GHL em Conta E2E" });
  await expect(select).toHaveText("Vendedor Teste");

  await select.click();
  await page.getByRole("option", { name: "Nenhum (escolhe o vendedor na tela)" }).click();
  await expect(dialog.getByText("Sem vínculo com o GHL: na tela, este usuário poderá escolher")).toBeVisible();

  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog).toHaveCount(0);

  const link = calls.find((c) => c.action === "set_ghl_link");
  expect(link).toEqual({
    action: "set_ghl_link", user_id: "user-vend-shared", workspace_id: "ws-e2e", ghl_user_id: null,
  });
});

test("Permissões: salvar sem mexer no vínculo não chama set_ghl_link", async ({ page }) => {
  await installSupabaseMocks(page, { role: "gestor" });
  await asAdmin(page);
  const actions: string[] = [];
  await page.route("**/functions/v1/admin-users**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS, body: "" });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    actions.push(String(body.action));
    const out = body.action === "list_users" ? { users: [VENDOR] }
      : body.action === "list_ghl_users" ? { ghl_users: [{ ghl_id: "ghlu-1", name: "Vendedor Teste", email: null }] }
      : { ok: true, workspaces: [] };
    return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(out) });
  });
  await loginAs(page, "gestor");

  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("button", { name: "Permissões" }).click();
  await expect(page.getByRole("combobox", { name: "Vendedor do GHL em Conta E2E" })).toHaveText("Vendedor Teste");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  expect(actions).toContain("set_permissions");
  expect(actions).not.toContain("set_ghl_link");
});
