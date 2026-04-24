import { Clock } from "lucide-react";
import { ResponseTime as RT } from "@/hooks/useGhlData";
import { SectionTooltip } from "./SectionTooltip";

interface ResponseTimeCardProps {
  responseTime: RT | null | undefined;
}

function formatDuration(minutes: number): { value: string; unit: string } {
  if (!isFinite(minutes) || minutes <= 0) return { value: "—", unit: "" };
  if (minutes < 1) return { value: "<1", unit: "min" };
  if (minutes < 60) return { value: Math.round(minutes).toString(), unit: "min" };
  const hours = minutes / 60;
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return { value: m > 0 ? `${h}h ${m}m` : `${h}h`, unit: "" };
  }
  const days = hours / 24;
  return { value: days.toFixed(1), unit: "dias" };
}

export function ResponseTimeCard({ responseTime }: ResponseTimeCardProps) {
  const minutes = responseTime?.averageMinutes ?? 0;
  const { value, unit } = formatDuration(minutes);
  const responses = responseTime?.responseCount ?? 0;
  const convs = responseTime?.conversationsAnalyzed ?? 0;
  const start = responseTime?.businessHoursStart || "09:00";
  const end = responseTime?.businessHoursEnd || "18:00";

  return (
    <div className="dashboard-section animate-slide-up h-full flex flex-col">
      <h2 className="section-title">
        <Clock className="w-5 h-5 text-primary" />
        Tempo médio de resposta
        <SectionTooltip text={`Tempo médio que o vendedor (número conectado) leva para responder o cliente. Considera conversas dos leads do funil/etapa filtrado(a). Sem pipeline selecionado, restringe às etapas mapeadas no funil comercial. Expediente: ${start} às ${end}.`} />
      </h2>

      <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
        {responses === 0 ? (
          <p className="text-muted-foreground text-sm py-8">
            Sem dados de resposta no período.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-foreground tabular-nums">{value}</span>
              {unit && <span className="text-xl text-muted-foreground font-semibold">{unit}</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Baseado em <span className="font-bold text-foreground">{responses}</span> resposta{responses === 1 ? "" : "s"}
              {convs > 0 && <> em <span className="font-bold text-foreground">{convs}</span> conversa{convs === 1 ? "" : "s"}</>}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Expediente: {start} – {end}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
