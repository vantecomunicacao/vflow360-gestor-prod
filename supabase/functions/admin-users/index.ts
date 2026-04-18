import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

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
    const { data: claims } = await (userClient.auth as any).getClaims(token);
    const userId = claims?.sub;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden — admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    switch (action) {
      case "list_users": {
        const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        if (error) throw error;
        const ids = list.users.map((u) => u.id);
        const [{ data: roles }, { data: profiles }, { data: members }] = await Promise.all([
          admin.from("user_roles").select("user_id, role").in("user_id", ids),
          admin.from("profiles").select("user_id, full_name").in("user_id", ids),
          admin.from("workspace_members").select("user_id, workspace_id, role, workspaces(name)").in("user_id", ids),
        ]);
        return json({
          users: list.users.map((u) => ({
            id: u.id,
            email: u.email,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at,
            full_name: profiles?.find((p) => p.user_id === u.id)?.full_name || null,
            roles: roles?.filter((r) => r.user_id === u.id).map((r) => r.role) || [],
            workspaces: (members?.filter((m) => m.user_id === u.id) || []).map((m: any) => ({
              workspace_id: m.workspace_id,
              role: m.role,
              name: m.workspaces?.name,
            })),
          })),
        });
      }

      case "list_workspaces": {
        const { data, error } = await admin.from("workspaces").select("id, name, owner_id").order("created_at");
        if (error) throw error;
        return json({ workspaces: data });
      }

      case "create_user": {
        const { email, password, full_name, workspace_id, role = "user" } = body;
        if (!email || !password) return json({ error: "email e password obrigatórios" }, 400);
        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name },
        });
        if (error) throw error;
        const newId = created.user!.id;
        if (role === "admin") {
          await admin.from("user_roles").upsert({ user_id: newId, role: "admin" });
        }
        if (workspace_id) {
          await admin.from("workspace_members").insert({ user_id: newId, workspace_id, role: "member" });
        }
        return json({ ok: true, user_id: newId });
      }

      case "update_password": {
        const { user_id, password } = body;
        if (!user_id || !password) return json({ error: "user_id e password obrigatórios" }, 400);
        const { error } = await admin.auth.admin.updateUserById(user_id, { password });
        if (error) throw error;
        return json({ ok: true });
      }

      case "delete_user": {
        const { user_id } = body;
        if (!user_id) return json({ error: "user_id obrigatório" }, 400);
        if (user_id === userId) return json({ error: "Não pode deletar a si mesmo" }, 400);
        const { error } = await admin.auth.admin.deleteUser(user_id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "set_role": {
        const { user_id, role, enabled } = body;
        if (!user_id || !role) return json({ error: "user_id e role obrigatórios" }, 400);
        if (enabled) {
          await admin.from("user_roles").upsert({ user_id, role });
        } else {
          await admin.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
        }
        return json({ ok: true });
      }

      case "add_to_workspace": {
        const { user_id, workspace_id, role = "member" } = body;
        if (!user_id || !workspace_id) return json({ error: "user_id e workspace_id obrigatórios" }, 400);
        await admin.from("workspace_members").upsert(
          { user_id, workspace_id, role },
          { onConflict: "user_id,workspace_id" } as any
        );
        return json({ ok: true });
      }

      case "remove_from_workspace": {
        const { user_id, workspace_id } = body;
        if (!user_id || !workspace_id) return json({ error: "user_id e workspace_id obrigatórios" }, 400);
        await admin.from("workspace_members").delete().eq("user_id", user_id).eq("workspace_id", workspace_id);
        return json({ ok: true });
      }

      case "promote_self_first_admin": {
        // Bootstrap: only allowed if there are zero admins in the system
        const { count } = await admin
          .from("user_roles")
          .select("*", { count: "exact", head: true })
          .eq("role", "admin");
        if ((count || 0) > 0) return json({ error: "Já existe admin no sistema" }, 403);
        await admin.from("user_roles").upsert({ user_id: userId, role: "admin" });
        return json({ ok: true });
      }

      default:
        return json({ error: "Ação desconhecida" }, 400);
    }
  } catch (e) {
    console.error("admin-users error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
