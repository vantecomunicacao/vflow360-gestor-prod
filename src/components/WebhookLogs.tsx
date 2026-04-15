import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { RefreshCw, ArrowDownLeft, ArrowUpRight, Image, FileAudio, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface WebhookLog {
  id: string;
  content: string;
  direction: string;
  created_at: string;
  media_url: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  integration_label: string | null;
}

export function WebhookLogs() {
  const { activeWorkspace } = useWorkspace();
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      // Get recent messages joined with conversation info
      const { data, error } = await supabase
        .from("messages")
        .select(`
          id, content, direction, created_at, media_url,
          conversations!inner(contact_name, contact_phone, integration_label, workspace_id)
        `)
        .eq("conversations.workspace_id", activeWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const mapped = (data || []).map((m: any) => ({
        id: m.id,
        content: m.content,
        direction: m.direction,
        created_at: m.created_at,
        media_url: m.media_url,
        contact_name: m.conversations?.contact_name,
        contact_phone: m.conversations?.contact_phone,
        integration_label: m.conversations?.integration_label,
      }));
      setLogs(mapped);
    } catch (err) {
      console.error("Error fetching webhook logs:", err);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "agora";
    if (diffMin < 60) return `${diffMin}m atrás`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h atrás`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const getMediaIcon = (url: string | null) => {
    if (!url) return null;
    if (url.match(/\.(jpg|jpeg|png|gif|webp)/i)) return <Image className="w-3 h-3 text-primary" />;
    if (url.match(/\.(ogg|mp3|wav|opus|m4a)/i)) return <FileAudio className="w-3 h-3 text-primary" />;
    return <File className="w-3 h-3 text-primary" />;
  };

  return (
    <div className="glass-card p-4 h-fit sticky top-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-foreground text-sm">Logs do Webhook</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-200px)]">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Nenhum log de webhook encontrado.</p>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-xs"
              >
                <div className="mt-0.5 shrink-0">
                  {log.direction === "inbound" ? (
                    <ArrowDownLeft className="w-3 h-3 text-success" />
                  ) : (
                    <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground truncate">
                      {log.contact_name || log.contact_phone || "Desconhecido"}
                    </span>
                    {log.integration_label && (
                      <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3 shrink-0">
                        {log.integration_label}
                      </Badge>
                    )}
                    {getMediaIcon(log.media_url)}
                  </div>
                  <p className="text-muted-foreground truncate">{log.content || "[mídia]"}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                  {formatTime(log.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
