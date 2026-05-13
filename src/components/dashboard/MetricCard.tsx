import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionTooltip } from "./SectionTooltip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  variant?: "default" | "accent" | "success" | "warning";
  tooltip?: string;
  className?: string;
}

export function MetricCard({
  title, value, subtitle, icon: Icon, trend, variant = "default", tooltip, className,
}: MetricCardProps) {
  const iconBgVariants = {
    default: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
  };

  return (
    <div className={cn("metric-card animate-slide-up", className)}>
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg shrink-0", iconBgVariants[variant])}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <p className="metric-label truncate">{title}</p>
              {tooltip && <SectionTooltip text={tooltip} />}
            </div>
            {trend && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full cursor-help shrink-0",
                        trend.isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {trend.isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      {Math.abs(trend.value)}%
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-xs leading-relaxed">
                    Comparação com o período anterior de mesma duração.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="flex items-baseline gap-2 mt-1.5">
            <p className="metric-value">{value}</p>
            {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
