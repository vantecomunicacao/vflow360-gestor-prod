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
      <div className="flex items-start justify-between mb-2 sm:mb-3">
        <div className={cn("p-2 sm:p-2.5 rounded-lg sm:rounded-xl", iconBgVariants[variant])}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        {trend && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full cursor-help",
                    trend.isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                  )}
                >
                  {trend.isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
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
      <div className="mt-1">
        <div className="flex items-center gap-1.5 mb-2.5">
          <p className="metric-label">{title}</p>
          {tooltip && <SectionTooltip text={tooltip} />}
        </div>
        <p className="metric-value text-xl sm:text-[1.65rem]">{value}</p>
        {subtitle && <p className="text-[13px] text-muted-foreground mt-2">{subtitle}</p>}
      </div>
    </div>
  );
}
