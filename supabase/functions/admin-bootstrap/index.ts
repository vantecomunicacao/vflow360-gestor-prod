// Public bootstrap: lets the FIRST authenticated user become admin if no admin exists yet.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

import { reportEdgeError } from "../_shared/error-reporter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    let userId: string | undefined;
    let userEmail: string | undefined;
    try {
      const { data: claims } = await (userClient.auth as any).getClaims(token);
      const c = claims?.claims ?? claims;
      userId = c?.sub;
      userEmail = c?.email;
    } catch (_) {}
    if (!userId) {
      const { data: u } = await userClient.auth.getUser(token);
      userId = u?.user?.id;
      userEmail = u?.user?.email ?? userEmail;
    }
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { count } = await admin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");

    if ((count || 0) > 0) {
      const { data: mine } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      return json({ has_admin: true, is_admin: !!mine });
    }

    // Allowlist: se ADMIN_BOOTSTRAP_ALLOWLIST estiver setada (CSV de emails),
    // só promove caller cujo email esteja na lista. Caso contrário (env vazia),
    // mantém o comportamento original ("primeiro user autenticado vira admin").
    const allowlistRaw = Deno.env.get("ADMIN_BOOTSTRAP_ALLOWLIST") || "";
    if (allowlistRaw.trim().length > 0) {
      const allowed = new Set(
        allowlistRaw
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      );
      const emailLower = (userEmail || "").toLowerCase();
      if (!emailLower || !allowed.has(emailLower)) {
        await reportEdgeError(
          "edge:admin-bootstrap:allowlist-rejected",
          new Error(`bootstrap rejected for ${emailLower || "(no email)"}`),
          { level: "warning", userId },
        );
        return json({ error: "Forbidden" }, 403);
      }
    }

    await admin.from("user_roles").upsert({ user_id: userId, role: "admin" });
    return json({ has_admin: true, is_admin: true, promoted: true });
  } catch (e) {
    const message = (e as Error).message;
    await reportEdgeError("edge:admin-bootstrap", e);
    return json({ error: message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
