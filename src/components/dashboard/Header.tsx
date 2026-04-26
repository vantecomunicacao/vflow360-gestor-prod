import { CalendarDays, RefreshCw, Filter, Users, GitBranch, ChevronDown, Globe, ChevronUp, Layers } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { Pipeline, User } from "@/hooks/useGhlData";
import { cn } from "@/lib/utils";

interface HeaderProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (r: DateRange | undefined) => void;
  onRefresh: (force?: boolean) => void;
  isLoading?: boolean;
  pipelines: Pipeline[];
  users: User[];
  origins: string[];
  selectedPipelineId: string | null;
  selectedStageId?: string | null;
  selectedSellerId: string | null;
  selectedOrigin: string | null;
  onPipelineChange: (id: string | null) => void;
  onStageChange?: (id: string | null) => void;
  onSellerChange: (id: string | null) => void;
  onOriginChange: (o: string | null) => void;
  cachedAt?: string | null;
  additionalDateRange?: DateRange | undefined;
  onAdditionalDateRangeChange?: (r: DateRange | undefined) => void;
  additionalDateLabel?: string | null;
}

const datePresets = [
  { label: "Hoje", getValue: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { label: "Ontem", getValue: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }) },
  { label: "Últimos 7 dias", getValue: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
  { label: "Últimos 30 dias", getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: "Últimos 90 dias", getValue: () => ({ from: subDays(new Date(), 90), to: new Date() }) },
  { label: "Este mês", getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: "Mês passado", getValue: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { label: "Este ano", getValue: () => ({ from: startOfYear(new Date()), to: new Date() }) },
];

function DateRangeFilter({ dateRange, onDateRangeChange, label, icon: Icon = CalendarDays }: {
  dateRange: DateRange | undefined; onDateRangeChange: (r: DateRange | undefined) => void;
  label?: string; icon?: typeof CalendarDays;
}) {
  const [localRange, setLocalRange] = useState<DateRange | undefined>(dateRange);
  const [open, setOpen] = useState(false);
  useEffect(() => setLocalRange(dateRange), [dateRange]);

  const handleConfirm = () => {
    if (localRange?.from && localRange?.to) {
      onDateRangeChange(localRange);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 h-9 rounded-lg text-sm">
          <Icon className="w-4 h-4" />
          {dateRange?.from ? (
            dateRange.to ? (
              <>{label ? `${label}: ` : ""}{format(dateRange.from, "dd MMM", { locale: ptBR })} - {format(dateRange.to, "dd MMM", { locale: ptBR })}</>
            ) : <>{label ? `${label}: ` : ""}{format(dateRange.from, "dd MMM yyyy", { locale: ptBR })}</>
          ) : <span>{label || "Período"}</span>}
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-2xl" align="start">
        <div className="flex">
          <div className="border-r border-border p-2 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground px-2 py-1">Atalhos</p>
            {datePresets.map((p) => (
              <Button key={p.label} variant="ghost" size="sm" className="w-full justify-start text-xs h-8 rounded-lg"
                onClick={() => { const v = p.getValue(); setLocalRange(v); onDateRangeChange(v); setOpen(false); }}>
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-col">
            <Calendar initialFocus mode="range" defaultMonth={localRange?.from} selected={localRange} onSelect={setLocalRange} numberOfMonths={2} locale={ptBR} className="pointer-events-auto" />
            <div className="flex justify-end p-3 pt-0">
              <Button size="sm" className="rounded-xl" disabled={!localRange?.from || !localRange?.to} onClick={handleConfirm}>Feito</Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Header({
  dateRange, onDateRangeChange, onRefresh, isLoading,
  pipelines, users, origins,
  selectedPipelineId, selectedStageId, selectedSellerId, selectedOrigin,
  onPipelineChange, onStageChange, onSellerChange, onOriginChange, cachedAt,
  additionalDateRange, onAdditionalDateRangeChange, additionalDateLabel,
}: HeaderProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hasAdditionalRange = !!additionalDateRange?.from;
  const activeFilterCount = [selectedPipelineId, selectedStageId, selectedSellerId, selectedOrigin, hasAdditionalRange].filter(Boolean).length;
  const showAdditional = !!additionalDateLabel && !!onAdditionalDateRangeChange;
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);
  const stages = selectedPipeline?.stages || [];

  return (
    <header className="sticky top-0 -mx-6 -mt-6 z-30 bg-card border-b border-border">
      <div className="flex items-center justify-between gap-4 px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {cachedAt && !isLoading && <span>Atualizado às {format(new Date(cachedAt), "HH:mm:ss", { locale: ptBR })}</span>}
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 gap-1.5 h-8 px-2" onClick={() => onRefresh(true)} disabled={isLoading} title="Forçar atualização">
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      <div className="px-4 pb-2">
        <button type="button" className="flex sm:hidden items-center justify-between w-full p-2 bg-muted/50 rounded-lg border border-border" onClick={() => setFiltersOpen(!filtersOpen)}>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="w-4 h-4" />Filtros
            {activeFilterCount > 0 && <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>}
          </div>
          {filtersOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        <div className={cn(
          "flex flex-wrap items-center gap-2",
          filtersOpen ? "flex flex-col gap-2 mt-2" : "hidden sm:flex"
        )}>
          <div className="hidden sm:flex items-center gap-2 text-sm font-medium text-muted-foreground mr-1">
            <Filter className="w-4 h-4" />
          </div>

          <DateRangeFilter dateRange={dateRange} onDateRangeChange={onDateRangeChange} />

          {showAdditional && (
            <DateRangeFilter
              dateRange={additionalDateRange}
              onDateRangeChange={onAdditionalDateRangeChange!}
              label={additionalDateLabel!}
            />
          )}

          <Select value={selectedPipelineId || "all"} onValueChange={(v) => onPipelineChange(v === "all" ? null : v)}>
            <SelectTrigger className="w-full sm:w-[180px] h-9 rounded-lg text-sm">
              <GitBranch className="w-4 h-4 mr-2 opacity-50" />
              <SelectValue placeholder="Funil" />
            </SelectTrigger>
            <SelectContent className="rounded-lg">
              <SelectItem value="all">Todos os funis</SelectItem>
              {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {selectedPipelineId && stages.length > 0 && onStageChange && (
            <Select value={selectedStageId || "all"} onValueChange={(v) => onStageChange(v === "all" ? null : v)}>
              <SelectTrigger className="w-full sm:w-[160px] h-9 rounded-lg text-sm">
                <Layers className="w-4 h-4 mr-2 opacity-50" />
                <SelectValue placeholder="Etapa" />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                <SelectItem value="all">Todas as etapas</SelectItem>
                {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <Select value={selectedSellerId || "all"} onValueChange={(v) => onSellerChange(v === "all" ? null : v)}>
            <SelectTrigger className="w-full sm:w-[160px] h-9 rounded-lg text-sm">
              <Users className="w-4 h-4 mr-2 opacity-50" />
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent className="rounded-lg">
              <SelectItem value="all">Todos os vendedores</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={selectedOrigin || "all"} onValueChange={(v) => onOriginChange(v === "all" ? null : v)}>
            <SelectTrigger className="w-full sm:w-[160px] h-9 rounded-lg text-sm">
              <Globe className="w-4 h-4 mr-2 opacity-50" />
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent className="rounded-lg">
              <SelectItem value="all">Todas as origens</SelectItem>
              {origins.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>

          {(selectedPipelineId || selectedStageId || selectedSellerId || selectedOrigin || hasAdditionalRange) && (
            <Button variant="ghost" size="sm" className="h-9 text-muted-foreground hover:text-foreground rounded-lg text-sm"
              onClick={() => {
                onPipelineChange(null); onStageChange?.(null); onSellerChange(null); onOriginChange(null);
                onAdditionalDateRangeChange?.(undefined);
              }}>
              Limpar
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
