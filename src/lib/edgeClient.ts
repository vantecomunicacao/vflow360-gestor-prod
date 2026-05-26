import { supabase } from "@/integrations/supabase/client";

/**
 * Call a Supabase edge function via direct fetch (not supabase.functions.invoke).
 * Used by integrations that require the standard `{ success, data, error }` envelope
 * returned by uazap-manage, evolution-manage, and ghl-manage. The caller is
 * responsible for assembling the request body (including any `action` field).
 */
export async function callEdge<T = unknown>(
  fnName: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body ?? {}),
    },
  );

  const result = await response.json();
  if (!result.success) throw new Error(result.error || "Unknown error");
  return result.data as T;
}
