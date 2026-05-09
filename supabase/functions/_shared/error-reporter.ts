// Shared error reporter for edge functions.
// Sends to n8n webhook AND persists in system_logs table (best-effort, never throws).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const WEBHOOK_URL = "https://n8n-webhook.boliqf.easypanel.host/webhook/erro-lovable";
const PROJECT = "VFlowGHL";

type Options = {
  level?: "error" | "warning" | "info";
  workspaceId?: string | null;
  userId?: string | null;
  context?: Record<string, unknown>;
};

export async function reportEdgeError(
  source: string,
  error: unknown,
  options: Options = {},
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const level = options.level ?? "error";
  const timestamp = new Date().toISOString();

  // Persist to DB (service role) — best effort
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && key) {
      const supabase = createClient(url, key);
      await supabase.from("system_logs").insert({
        level,
        source,
        message: message.slice(0, 4000),
        stack: stack ? stack.slice(0, 8000) : null,
        context: options.context ?? {},
        workspace_id: options.workspaceId ?? null,
        user_id: options.userId ?? null,
        env: "edge",
      });
    }
  } catch (_) {
    // ignore
  }

  // Send to n8n webhook — best effort
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: PROJECT,
        level,
        source,
        message,
        stack,
        context: options.context ?? {},
        workspace_id: options.workspaceId ?? null,
        user_id: options.userId ?? null,
        timestamp,
      }),
    });
  } catch (_) {
    // ignore
  }
}
