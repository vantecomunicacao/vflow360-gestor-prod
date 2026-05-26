import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Status = "connected" | "connecting" | "disconnected" | string;

interface IntegrationRow {
  id: string;
  type: string;
  status: Status;
  config: { label?: string; instanceName?: string } | null;
}

export function useIntegrationDisconnectWatcher() {
  const { user } = useAuth();
  const lastStatus = useRef<Map<string, Status>>(new Map());

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("integrations")
        .select("id, type, status, config")
        .eq("user_id", user.id)
        .eq("type", "whatsapp_evolution");

      if (cancelled) return;
      const seed = new Map<string, Status>();
      (data ?? []).forEach((i) => seed.set(i.id, (i as IntegrationRow).status));
      lastStatus.current = seed;
    })();

    const channel = supabase
      .channel(`integrations:disconnect:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "integrations",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const next = payload.new as IntegrationRow;
          if (next.type !== "whatsapp_evolution") return;

          const prev = lastStatus.current.get(next.id);
          lastStatus.current.set(next.id, next.status);

          const becameDisconnected =
            next.status === "disconnected" &&
            (prev === "connected" || prev === "connecting");

          if (becameDisconnected) {
            const label =
              next.config?.label || next.config?.instanceName || "Evolution";
            toast.error(`WhatsApp desconectado — ${label}`, {
              description:
                "Reconecte na página de Integrações para continuar recebendo mensagens.",
              duration: 10000,
            });
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);
}
