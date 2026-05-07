const WEBHOOK_URL = "https://n8n-webhook.boliqf.easypanel.host/webhook/erro-lovable";
const PROJECT = "VFlowGHL";

export async function reportEdgeError(source: string, error: unknown): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: PROJECT,
        level: "error",
        source,
        message,
        stack,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (_) {
    // ignore — reporter must never throw
  }
}
