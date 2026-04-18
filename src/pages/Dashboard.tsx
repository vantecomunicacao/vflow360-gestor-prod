import { useEffect, useMemo, useState, useCallback } from "react";
import { Users, Target, DollarSign, TrendingUp, RefreshCw, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

interface SyncStatus {
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  opportunities_count: number | null;
  is_running: boolean;
}

interface OppRow {
  id: string;
  name: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  status: string | null;
  monetary_value: number | null;
  ghl_created_at: string | null;
}

interface PipelineRow {
  ghl_id: string;
  name: string;
  stages: Array<{ id: string; name: string }> | null;
}

const Dashboard = () => {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [opps, setOpps] = useState<OppRow[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRow[]>([]);
  const [loading, setLoading] = useState(true);

  const workspaceId = activeWorkspace?.id;

  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [statusQ, oppsQ, pipQ] = await Promise.all([
        supabase.from("ghl_sync_status").select("*").eq("workspace_id", workspaceId).maybeSingle(),
        supabase
          .from("ghl_opportunities")
          .select("id,name,pipeline_id,stage_id,status,monetary_value,ghl_created_at")
          .eq("workspace_id", workspaceId)
          .order("ghl_created_at", { ascending: false })
          .limit(1000),
        supabase.from("ghl_pipelines").select("ghl_id,name,stages").eq("workspace_id", workspaceId),
      ]);
      setSyncStatus((statusQ.data as SyncStatus) || null);
      setOpps((oppsQ.data as OppRow[]) || []);
      setPipelines((pipQ.data as PipelineRow[]) || []);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async () => {
    if (!workspaceId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ghl-sync", {
        body: { workspace_id: workspaceId },
      });
      if (error) throw error;
      if (data && (data as any).ok === false) throw new Error((data as any).error || "Erro no sync");
      toast({
        title: "Sincronização concluída",
        description: `${(data as any).opportunities_count ?? 0} oportunidades atualizadas`,
      });
      await loadData();
    } catch (err: any) {
      toast({
        title: "Erro ao sincronizar",
        description: err.message || "Falha desconhecida",
        variant: "destructive",
      });
      await loadData();
    } finally {
      setSyncing(false);
    }
  };

  // ----- Métricas derivadas -----
  const metrics = useMemo(() => {
    const total = opps.length;
    const won = opps.filter((o) => (o.status || "").toLowerCase() === "won").length;
    const lost = opps.filter((o) => (o.status || "").toLowerCase() === "lost").length;
    const open = opps.filter((o) => {
      const s = (o.status || "").toLowerCase();
      return s !== "won" && s !== "lost" && s !== "abandoned";
    }).length;
    const pipelineValue = opps.reduce((acc, o) => acc + (o.monetary_value || 0), 0);
    const conversion = total > 0 ? (won / total) * 100 : 0;
    return { total, won, lost, open, pipelineValue, conversion };
  }, [opps]);

  const stageData = useMemo(() => {
    if (!pipelines.length) return [];
    // junta TODAS as etapas de TODOS os pipelines, conta opps por stage_id
    const stageMap = new Map<string, { name: string; count: number }>();
    for (const p of pipelines) {
      for (const s of p.stages || []) {
        stageMap.set(s.id, { name: s.name, count: 0 });
      }
    }
    for (const o of opps) {
      if (o.stage_id && stageMap.has(o.stage_id)) {
        stageMap.get(o.stage_id)!.count += 1;
      }
    }
    return Array.from(stageMap.values()).filter((s) => s.count > 0).slice(0, 12);
  }, [pipelines, opps]);

  const pieData = useMemo(() => {
    return [
      { name: "Ganhas", value: metrics.won, color: "hsl(155, 60%, 45%)" },
      { name: "Perdidas", value: metrics.lost, color: "hsl(0, 72%, 51%)" },
      { name: "Em andamento", value: metrics.open, color: "hsl(210, 80%, 55%)" },
    ];
  }, [metrics]);

  const stats = [
    { label: "Total de Oportunidades", value: metrics.total.toLocaleString("pt-BR"), icon: Users },
    { label: "Ganhas", value: metrics.won.toLocaleString("pt-BR"), icon: Target },
    {
      label: "Valor em Pipeline",
      value: metrics.pipelineValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
      icon: DollarSign,
    },
    { label: "Taxa de Conversão", value: `${metrics.conversion.toFixed(1)}%`, icon: TrendingUp },
  ];

  // Health badge
  const healthBadge = useMemo(() => {
    if (!syncStatus?.last_sync_at) {
      return { label: "Nunca sincronizado", variant: "secondary" as const, icon: AlertCircle };
    }
    const ageH = (Date.now() - new Date(syncStatus.last_sync_at).getTime()) / 36e5;
    if (syncStatus.last_sync_status === "error") {
      return { label: "Erro no último sync", variant: "destructive" as const, icon: AlertCircle };
    }
    if (ageH < 12) return { label: "Atualizado", variant: "default" as const, icon: CheckCircle2 };
    if (ageH < 36) return { label: `Há ${Math.round(ageH)}h`, variant: "secondary" as const, icon: Clock };
    return { label: "Desatualizado", variant: "destructive" as const, icon: AlertCircle };
  }, [syncStatus]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            {activeWorkspace ? `${activeWorkspace.name} · ` : ""}Visão geral das oportunidades GHL
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={healthBadge.variant} className="gap-1.5">
            <healthBadge.icon className="w-3.5 h-3.5" />
            {healthBadge.label}
          </Badge>
          <Button onClick={handleSync} disabled={syncing || !workspaceId}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Atualizar agora"}
          </Button>
        </div>
      </div>

      {syncStatus?.last_sync_error && (
        <div className="glass-card p-3 border border-destructive/40 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Último sync falhou:</strong> {syncStatus.last_sync_error}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <stat.icon className="w-5 h-5 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">{loading ? "—" : stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stages chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-5 lg:col-span-2"
        >
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Oportunidades por Etapa
          </h3>
          {stageData.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
              {loading ? "Carregando..." : "Sem dados — clique em Atualizar agora"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stageData}>
                <XAxis dataKey="name" tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-15} height={50} textAnchor="end" />
                <YAxis tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(220, 25%, 8%)",
                    border: "1px solid hsl(220, 20%, 14%)",
                    borderRadius: "8px",
                    color: "hsl(220, 10%, 90%)",
                  }}
                />
                <Bar dataKey="count" fill="hsl(155, 60%, 45%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* Pie */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-5"
        >
          <h3 className="text-lg font-semibold text-foreground mb-4">Status Geral</h3>
          {metrics.total === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              Sem dados ainda
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={4}>
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {pieData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-muted-foreground">{item.name}</span>
                    <span className="ml-auto text-foreground font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      <div className="text-xs text-muted-foreground">
        {syncStatus?.last_sync_at
          ? `Última sincronização: ${new Date(syncStatus.last_sync_at).toLocaleString("pt-BR")}`
          : "Nenhuma sincronização realizada ainda"}
        {syncStatus?.opportunities_count != null && ` · ${syncStatus.opportunities_count} oportunidades importadas`}
      </div>
    </div>
  );
};

export default Dashboard;
