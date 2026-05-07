// Centralized error reporter — sends errors to external n8n webhook.
// Webhook is public (no auth); safe to call from the browser.

const WEBHOOK_URL = "https://n8n-webhook.boliqf.easypanel.host/webhook/erro-lovable";
const PROJECT = "VFlowGHL";

type ReportPayload = {
  level?: "error" | "warning" | "info";
  source: string; // e.g. "frontend:window.onerror", "frontend:react-query", "frontend:Suggestions"
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
};

const recentHashes = new Map<string, number>();
const DEDUPE_MS = 10_000;

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(h);
}

export async function reportError(payload: ReportPayload): Promise<void> {
  try {
    const key = hash(`${payload.source}|${payload.message}`);
    const now = Date.now();
    const last = recentHashes.get(key);
    if (last && now - last < DEDUPE_MS) return;
    recentHashes.set(key, now);

    const body = {
      project: PROJECT,
      env: import.meta.env.MODE,
      level: payload.level ?? "error",
      source: payload.source,
      message: payload.message,
      stack: payload.stack,
      context: payload.context ?? {},
      url: typeof window !== "undefined" ? window.location.href : undefined,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      timestamp: new Date().toISOString(),
    };

    // Fire-and-forget; never block UI on reporting.
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // Swallow — reporter must never throw.
  }
}

export function installGlobalErrorReporter() {
  if (typeof window === "undefined") return;
  if ((window as any).__errorReporterInstalled) return;
  (window as any).__errorReporterInstalled = true;

  window.addEventListener("error", (event) => {
    const err = event.error as Error | undefined;
    void reportError({
      source: "frontend:window.onerror",
      message: err?.message || event.message || "Unknown error",
      stack: err?.stack,
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason: any = event.reason;
    const message =
      typeof reason === "string"
        ? reason
        : reason?.message || JSON.stringify(reason ?? "unhandledrejection");
    void reportError({
      source: "frontend:unhandledrejection",
      message,
      stack: reason?.stack,
    });
  });
}
