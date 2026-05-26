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
interface CustomField { id: string; ghl_id: string; name: string; field_key: string | null; data_type?: string | null; model?: string | null; }

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
  const [utmSourceField, setUtmSourceField] = useState<string>("");
  const [utmMediumField, setUtmMediumField] = useState<string>("");
  const [utmCampaignField, setUtmCampaignField] = useState<string>("");
  const [additionalDateField, setAdditionalDateField] = useState<string>("");
  const [visibleFields, setVisibleFields] = useState<string[]>([]);
  const [chartFields, setChartFields] = useState<string[]>([]);
  const [businessStart, setBusinessStart] = useState<string>("09:00");
  const [businessEnd, setBusinessEnd] = useState<string>("18:00");
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
        supabase.from("ghl_custom_fields").select("id,ghl_id,name,field_key,data_type,model").eq("workspace_id", activeWorkspace.id),
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
        setUtmSourceField((settings as any).utm_source_field_id || "");
        setUtmMediumField((settings as any).utm_medium_field_id || "");
        setUtmCampaignField((settings as any).utm_campaign_field_id || "");
        setAdditionalDateField(settings.additional_date_field || "");
        setVisibleFields(settings.visible_custom_fields || []);
        setChartFields((settings as any).chart_custom_fields || []);
        setBusinessStart((settings as any).business_hours_start || "09:00");
        setBusinessEnd((settings as any).business_hours_end || "18:00");
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
        utm_source_field_id: utmSourceField || null,
        utm_medium_field_id: utmMediumField || null,
        utm_campaign_field_id: utmCampaignField || null,
        additional_date_field: additionalDateField || null,
        visible_custom_fields: visibleFields,
        chart_custom_fields: chartFields.filter((id) => visibleFields.includes(id)),
        business_hours_start: businessStart || "09:00",
        business_hours_end: businessEnd || "18:00",
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

    // Cooldown client-side de 2min por workspace
    const ckey = `ghl-sync-last:${activeWorkspace.id}`;
    const lastStr = localStorage.getItem(ckey);
    const last = lastStr ? Number(lastStr) : 0;
    const elapsed = Date.now() - last;
    const COOLDOWN = 2 * 60 * 1000;
    if (last && elapsed < COOLDOWN) {
      const wait = Math.ceil((COOLDOWN - elapsed) / 1000);
      toast.warning("Aguarde para sincronizar", {
        description: `Você pode sincronizar novamente em ${wait}s.`,
      });
      return;
    }
    localStorage.setItem(ckey, String(Date.now()));

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ghl-sync", {
        body: { workspace_id: activeWorkspace.id },
      });
      if (error) throw error;
      const errMsg = (data as any)?.error;
      if (errMsg) {
        toast.warning("Sincronização", { description: errMsg });
      } else {
        toast.success("Sincronização concluída", { description: "Pipelines, campos, usuários e oportunidades atualizados." });
      }
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
    setVisibleFields((prev) => {
      const next = prev.includes(ghl_id) ? prev.filter((p) => p !== ghl_id) : [...prev, ghl_id];
      // se removeu o campo, remove também do gráfico
      if (!next.includes(ghl_id)) {
        setChartFields((cp) => cp.filter((p) => p !== ghl_id));
      }
      return next;
    });
  };

  const toggleChartField = (ghl_id: string) => {
    setChartFields((prev) =>
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Configurações do Dashboard</h1>
          <p className="text-muted-foreground text-sm">Personalize agregações e campos exibidos por conta</p>
          {syncStatus?.last_sync_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Última sincronização:{" "}
              {formatDistanceToNow(new Date(syncStatus.last_sync_at), { addSuffix: true, locale: ptBR })}
              {typeof syncStatus.opportunities_count === "number" && ` · ${syncStatus.opportunities_count} oportunidades`}
              {syncStatus.last_sync_status === "error" && " · ⚠️ erro"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={syncNow} disabled={syncing || saving}>
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sincronizar agora
          </Button>
          <Button onClick={save} disabled={saving || syncing}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Pipeline padrão */}
      <Card>
        <CardHeader>
          <CardTitle>Funil padrão</CardTitle>
          <CardDescription>Selecione o funil que será aberto automaticamente no Dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {pipelines.map((p) => (
            <label key={p.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="defaultPipeline"
                className="accent-primary"
                checked={defaultPipelines[0] === p.ghl_id}
                onChange={() => setDefaultPipelines([p.ghl_id])}
              />
              <span>{p.name}</span>
              <span className="text-xs text-muted-foreground">({p.stages.length} etapas)</span>
            </label>
          ))}
          {pipelines.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="radio"
                name="defaultPipeline"
                className="accent-primary"
                checked={defaultPipelines.length === 0}
                onChange={() => setDefaultPipelines([])}
              />
              <span className="text-sm text-muted-foreground">Sem padrão (mostrar todos)</span>
            </label>
          )}
          {pipelines.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pipeline sincronizado.</p>}
        </CardContent>
      </Card>

      {/* Mapeamento do funil */}
      <Card>
        <CardHeader>
          <CardTitle>Mapeamento do funil</CardTitle>
          <CardDescription>
            Associe cada etapa do CRM a uma das 4 fases do funil analítico. Etapas sem mapeamento são ignoradas.
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

      {/* Campos UTM */}
      <Card>
        <CardHeader>
          <CardTitle>Campos UTM</CardTitle>
          <CardDescription>
            Mapeie quais custom fields do GHL correspondem aos parâmetros UTM. Os 3 alimentam o card "Origem dos leads" no dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: "source", label: "UTM Source", value: utmSourceField, setter: setUtmSourceField, hint: "Plataforma (ex.: google, facebook, instagram)" },
            { key: "medium", label: "UTM Medium", value: utmMediumField, setter: setUtmMediumField, hint: "Tipo de mídia (ex.: cpc, social, organic, email)" },
            { key: "campaign", label: "UTM Campaign", value: utmCampaignField, setter: setUtmCampaignField, hint: "Campanha específica (ex.: black-friday, lançamento-x)" },
          ].map((utm) => (
            <div key={utm.key} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
              <div>
                <Label className="text-sm font-medium">{utm.label}</Label>
                <p className="text-xs text-muted-foreground">{utm.hint}</p>
              </div>
              <div className="md:col-span-2">
                <Select value={utm.value || "__none__"} onValueChange={(v) => utm.setter(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione um campo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— não configurado —</SelectItem>
                    {customFields
                      .filter((f) => (f.model || "").toLowerCase() === "opportunity")
                      .map((f) => (
                        <SelectItem key={f.id} value={f.ghl_id}>{f.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Campos visíveis */}
      <Card>
        <CardHeader>
          <CardTitle>Campos customizados visíveis</CardTitle>
          <CardDescription>
            Quais campos contam na seção de Qualidade dos Dados. Apenas campos de <strong>Oportunidade</strong> são exibidos
            — campos de Contato não são salvos nas oportunidades do CRM e apareceriam sempre como 0% preenchidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 max-h-96 overflow-y-auto">
          {(() => {
            const oppFields = customFields.filter((f) => (f.model || "").toLowerCase() === "opportunity");
            if (oppFields.length === 0) {
              return <p className="text-sm text-muted-foreground">Nenhum campo customizado de oportunidade sincronizado.</p>;
            }
            return oppFields.map((f) => {
              const isVisible = visibleFields.includes(f.ghl_id);
              return (
                <div key={f.id} className="flex items-center justify-between gap-4 py-1">
                  <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                    <Checkbox
                      checked={isVisible}
                      onCheckedChange={() => toggleField(f.ghl_id)}
                    />
                    <span className="truncate">{f.name}</span>
                    {f.field_key && <span className="text-xs text-muted-foreground hidden sm:inline">({f.field_key})</span>}
                    {f.data_type && <span className="text-xs text-muted-foreground hidden sm:inline">[{f.data_type}]</span>}
                  </label>
                  {isVisible && (
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground shrink-0">
                      <Checkbox
                        checked={chartFields.includes(f.ghl_id)}
                        onCheckedChange={() => toggleChartField(f.ghl_id)}
                      />
                      <span>Mostrar gráfico no dashboard</span>
                    </label>
                  )}
                </div>
              );
            });
          })()}
          {visibleFields.some((id) => {
            const f = customFields.find((c) => c.ghl_id === id);
            return f && (f.model || "").toLowerCase() !== "opportunity";
          }) && (
            <p className="text-xs text-warning-ink mt-3">
              ⚠ Há campos de Contato selecionados nas suas configurações antigas. Eles aparecerão sempre como 0%. Remova-os e selecione campos de Oportunidade.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Horário comercial (tempo de resposta) */}
      <Card>
        <CardHeader>
          <CardTitle>Horário comercial (tempo de resposta)</CardTitle>
          <CardDescription>
            Período em que sua equipe está disponível. O cálculo de "Tempo médio de resposta" do dashboard
            ignora o tempo fora desse intervalo (ex: cliente manda mensagem de madrugada e o vendedor responde de manhã).
            Para expediente que vira a noite (ex: 18h às 09h), basta inverter os horários.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="bh-start" className="text-xs">Início</Label>
            <input
              id="bh-start"
              type="time"
              value={businessStart}
              onChange={(e) => setBusinessStart(e.target.value)}
              className="h-10 px-3 rounded-xl border border-input bg-background text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bh-end" className="text-xs">Fim</Label>
            <input
              id="bh-end"
              type="time"
              value={businessEnd}
              onChange={(e) => setBusinessEnd(e.target.value)}
              className="h-10 px-3 rounded-xl border border-input bg-background text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground basis-full">
            Atual: <span className="font-bold">{businessStart || "09:00"}</span> às <span className="font-bold">{businessEnd || "18:00"}</span>
          </p>
        </CardContent>
      </Card>

      {/* Campo de data adicional */}
      <Card>
        <CardHeader>
          <CardTitle>Campo de data adicional (opcional)</CardTitle>
          <CardDescription>
            Quando configurado, o dashboard ganha um segundo filtro de período baseado nesse campo (ex: data de fechamento).
            Apenas campos do tipo data do CRM são listados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const dateFields = customFields.filter((f) =>
              f.data_type ? DATE_TYPES.includes(f.data_type) : false
            );
            if (dateFields.length === 0) {
              return <p className="text-sm text-muted-foreground">Nenhum campo de data sincronizado do CRM.</p>;
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
