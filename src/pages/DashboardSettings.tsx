import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Save, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const FUNNEL_BUCKETS = [
  { key: "contato_inicial", label: "Contato Inicial" },
  { key: "proposta_enviada", label: "Proposta Enviada" },
  { key: "fechamento", label: "Fechamento" },
  { key: "venda_ganha", label: "Venda Ganha" },
];

interface Stage { id: string; name: string; }
interface Pipeline { id: string; ghl_id: string; name: string; stages: Stage[]; }
interface CustomField { id: string; ghl_id: string; name: string; field_key: string | null; data_type?: string | null; }

const DATE_TYPES = ["DATE", "DATETIME", "DATE_TIME", "date", "datetime", "Date", "DateTime"];

export default function DashboardSettings() {
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ last_sync_at: string | null; last_sync_status: string | null; opportunities_count: number | null } | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  const [defaultPipelines, setDefaultPipelines] = useState<string[]>([]);
  const [stageMapping, setStageMapping] = useState<Record<string, string>>({}); // stageId -> bucket key
  const [originField, setOriginField] = useState<string>("__source__");
  const [additionalDateField, setAdditionalDateField] = useState<string>("");
  const [visibleFields, setVisibleFields] = useState<string[]>([]);
  const [wonStageKeys, setWonStageKeys] = useState<string[]>(["venda_ganha"]);

  useEffect(() => {
    if (!activeWorkspace?.id) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  const loadAll = async () => {
    if (!activeWorkspace?.id) return;
    setLoading(true);
    try {
      const [{ data: pipes }, { data: fields }, { data: settings }, { data: status }] = await Promise.all([
        supabase.from("ghl_pipelines").select("*").eq("workspace_id", activeWorkspace.id),
        supabase.from("ghl_custom_fields").select("id,ghl_id,name,field_key,data_type").eq("workspace_id", activeWorkspace.id),
        supabase.from("ghl_dashboard_settings").select("*").eq("workspace_id", activeWorkspace.id).maybeSingle(),
        supabase.from("ghl_sync_status").select("last_sync_at,last_sync_status,opportunities_count").eq("workspace_id", activeWorkspace.id).maybeSingle(),
      ]);
      setSyncStatus(status as any);
      const ps = (pipes || []).map((p: any) => ({
        id: p.id, ghl_id: p.ghl_id, name: p.name,
        stages: Array.isArray(p.stages) ? p.stages : [],
      }));
      setPipelines(ps);
      setCustomFields((fields || []) as any);
      if (settings) {
        setDefaultPipelines(settings.default_pipeline_ids || []);
        setStageMapping((settings.funnel_stage_mapping as any) || {});
        setOriginField(settings.origin_field_name || "__source__");
        setAdditionalDateField(settings.additional_date_field || "");
        setVisibleFields(settings.visible_custom_fields || []);
        setWonStageKeys(settings.won_stage_keys || ["venda_ganha"]);
      }
    } catch (e) {
      toast.error("Erro ao carregar", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!activeWorkspace?.id) return;
    setSaving(true);
    try {
      const payload = {
        workspace_id: activeWorkspace.id,
        default_pipeline_ids: defaultPipelines,
        funnel_stage_mapping: stageMapping,
        origin_field_name: originField,
        additional_date_field: additionalDateField || null,
        visible_custom_fields: visibleFields,
        won_stage_keys: wonStageKeys,
      };
      const { error } = await supabase
        .from("ghl_dashboard_settings")
        .upsert(payload as any, { onConflict: "workspace_id" });
      if (error) throw error;
      toast.success("Configurações salvas");
    } catch (e) {
      toast.error("Erro ao salvar", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    if (!activeWorkspace?.id) return;
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("ghl-sync", {
        body: { workspace_id: activeWorkspace.id },
      });
      if (error) throw error;
      toast.success("Sincronização concluída", { description: "Pipelines, campos, usuários e oportunidades atualizados." });
      await loadAll();
    } catch (e) {
      toast.error("Erro ao sincronizar", { description: (e as Error).message });
    } finally {
      setSyncing(false);
    }
  };

  const togglePipeline = (ghl_id: string) => {
    setDefaultPipelines((prev) =>
      prev.includes(ghl_id) ? prev.filter((p) => p !== ghl_id) : [...prev, ghl_id]
    );
  };

  const toggleField = (ghl_id: string) => {
    setVisibleFields((prev) =>
      prev.includes(ghl_id) ? prev.filter((p) => p !== ghl_id) : [...prev, ghl_id]
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  if (!activeWorkspace) {
    return <p className="text-muted-foreground">Selecione uma conta primeiro.</p>;
  }

  const allStages = pipelines.flatMap((p) => p.stages.map((s) => ({ ...s, pipelineName: p.name })));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configurações do Dashboard</h1>
          <p className="text-muted-foreground text-sm">Personalize agregações e campos exibidos por conta</p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar
        </Button>
      </div>

      {/* Pipelines padrão */}
      <Card>
        <CardHeader>
          <CardTitle>Pipelines padrão</CardTitle>
          <CardDescription>Marque os pipelines incluídos no dashboard por padrão. Vazio = todos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {pipelines.map((p) => (
            <label key={p.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={defaultPipelines.includes(p.ghl_id)}
                onCheckedChange={() => togglePipeline(p.ghl_id)}
              />
              <span>{p.name}</span>
              <span className="text-xs text-muted-foreground">({p.stages.length} etapas)</span>
            </label>
          ))}
          {pipelines.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pipeline sincronizado.</p>}
        </CardContent>
      </Card>

      {/* Mapeamento do funil */}
      <Card>
        <CardHeader>
          <CardTitle>Mapeamento do funil</CardTitle>
          <CardDescription>
            Associe cada etapa do GHL a uma das 4 fases do funil analítico. Etapas sem mapeamento são ignoradas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {allStages.map((s) => (
            <div key={s.id} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
              <div className="text-sm">
                <div>{s.name}</div>
                <div className="text-xs text-muted-foreground">{(s as any).pipelineName}</div>
              </div>
              <Select
                value={stageMapping[s.id] || "__none__"}
                onValueChange={(v) =>
                  setStageMapping((prev) => {
                    const next = { ...prev };
                    if (v === "__none__") delete next[s.id];
                    else next[s.id] = v;
                    return next;
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ignorar</SelectItem>
                  {FUNNEL_BUCKETS.map((b) => (
                    <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          {allStages.length === 0 && <p className="text-sm text-muted-foreground">Sincronize pipelines primeiro.</p>}
        </CardContent>
      </Card>

      {/* Etapas "ganhas" */}
      <Card>
        <CardHeader>
          <CardTitle>Etapas consideradas como "Ganho"</CardTitle>
          <CardDescription>Quais buckets do funil contam como Venda Ganha</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {FUNNEL_BUCKETS.map((b) => (
            <label key={b.key} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={wonStageKeys.includes(b.key)}
                onCheckedChange={() =>
                  setWonStageKeys((prev) =>
                    prev.includes(b.key) ? prev.filter((k) => k !== b.key) : [...prev, b.key]
                  )
                }
              />
              <span>{b.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Campo de origem */}
      <Card>
        <CardHeader>
          <CardTitle>Campo de origem</CardTitle>
          <CardDescription>De onde vem o dado de "origem" do lead nos gráficos</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={originField} onValueChange={setOriginField}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__source__">Source padrão da Opportunity</SelectItem>
              {customFields.map((f) => (
                <SelectItem key={f.id} value={f.ghl_id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Campos visíveis */}
      <Card>
        <CardHeader>
          <CardTitle>Campos customizados visíveis</CardTitle>
          <CardDescription>Quais campos contam na seção de Qualidade dos Dados</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 max-h-96 overflow-y-auto">
          {customFields.map((f) => (
            <label key={f.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={visibleFields.includes(f.ghl_id)}
                onCheckedChange={() => toggleField(f.ghl_id)}
              />
              <span>{f.name}</span>
              {f.field_key && <span className="text-xs text-muted-foreground">({f.field_key})</span>}
            </label>
          ))}
          {customFields.length === 0 && <p className="text-sm text-muted-foreground">Nenhum campo customizado sincronizado.</p>}
        </CardContent>
      </Card>

      {/* Campo de data adicional */}
      <Card>
        <CardHeader>
          <CardTitle>Campo de data adicional (opcional)</CardTitle>
          <CardDescription>
            Quando configurado, o dashboard ganha um segundo filtro de período baseado nesse campo (ex: data de fechamento).
            Apenas campos do tipo data do GHL são listados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const dateFields = customFields.filter((f) =>
              f.data_type ? DATE_TYPES.includes(f.data_type) : false
            );
            if (dateFields.length === 0) {
              return <p className="text-sm text-muted-foreground">Nenhum campo de data sincronizado do GHL.</p>;
            }
            return (
              <Select
                value={additionalDateField || "__none__"}
                onValueChange={(v) => setAdditionalDateField(v === "__none__" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {dateFields.map((f) => (
                    <SelectItem key={f.id} value={f.ghl_id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
