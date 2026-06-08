import { defineConfig, devices } from "@playwright/test";

// Porta dedicada para E2E — separada do dev server local (8080) para nunca
// reutilizar um servidor apontado para o Supabase REAL de produção.
const PORT = 8090;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // O dev server do Vite compila chunks sob demanda; muitos cold-hits paralelos
  // no /login estouram o tempo. 2 workers mantêm a compilação estável.
  workers: 2,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Sobe o app com credenciais STUB. O host stub.supabase.co não resolve, então
  // qualquer request não interceptado morre num host inexistente — nunca em prod.
  // Os mocks de rede (helpers/supabaseMock.ts) respondem por toda a UI.
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: "https://stub.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_stub",
      VITE_SUPABASE_PROJECT_ID: "stub",
    },
  },
});
