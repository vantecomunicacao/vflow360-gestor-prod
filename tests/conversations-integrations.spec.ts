import { test, expect } from "@playwright/test";
import { installSupabaseMocks, loginAs } from "./helpers/supabaseMock";

// Navegamos por clique (SPA, sem reload) para evitar a corrida de permissões
// que ocorre apenas no reload completo de rotas protegidas por PermissionGuard.

test.describe("Conversas 2.0 (gestor)", () => {
  test("carrega a lista e mostra a conversa mockada", async ({ page }) => {
    await installSupabaseMocks(page, { role: "gestor" });
    await loginAs(page, "gestor");
    await page.getByRole("link", { name: "Conversas 2.0" }).click();

    await expect(page.getByRole("heading", { name: /conversas 2\.0/i })).toBeVisible();
    await expect(page.getByText("João Cliente")).toBeVisible();
    await expect(page.getByText(/selecione uma conversa/i)).toBeVisible();
  });
});

test.describe("Integrações (gestor)", () => {
  test("carrega as seções de WhatsApp e GHL", async ({ page }) => {
    await installSupabaseMocks(page, { role: "gestor" });
    await loginAs(page, "gestor");
    await page.getByRole("link", { name: "Integrações" }).click();

    await expect(page.getByRole("heading", { name: /integrações/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /whatsapp/i }).first()).toBeVisible();
  });
});

test.describe("Pareamento público (sem login)", () => {
  test("token válido renderiza a tela de QR Code", async ({ page }) => {
    // Página pública, sem login e sem guards — reload direto é o fluxo real.
    await installSupabaseMocks(page, { role: "gestor" });
    await page.goto("/conectar/token-de-teste");

    await expect(page.getByText("Conectar WhatsApp")).toBeVisible();
    await expect(page.getByText(/aponte a câmera para este qr code/i)).toBeVisible();
  });

  test("token inválido renderiza a tela de expirado", async ({ page }) => {
    await installSupabaseMocks(page, { role: "gestor" });
    await page.route("**/functions/v1/evolution-pairing-public**", (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
        body: JSON.stringify({ ok: false }),
      });
    });
    await page.goto("/conectar/token-invalido");

    await expect(page.getByText(/link inválido ou expirado/i)).toBeVisible();
  });
});
