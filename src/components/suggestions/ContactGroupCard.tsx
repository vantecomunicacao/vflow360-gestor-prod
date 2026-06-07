import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AnimatePresence } from "framer-motion";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  Phone,
  Power,
  Smartphone,
  User,
  UserCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SuggestionCard } from "./SuggestionCard";
import {
  ACTION_TYPE_LABELS,
  type ContactGroup,
  type ExecutionResult,
  type LostReason,
} from "./types";

interface ContactGroupCardProps {
  group: ContactGroup;
  isOpen: boolean;
  isContactDisabled: boolean;
  approvingThisGroup: boolean;
  rejectingThisGroup: boolean;
  approveProgress: { current: number; total: number } | null;
  anyExecuting: boolean;
  executingId: string | null;
  executionResults: Record<string, ExecutionResult>;
  lostReasons: LostReason[];
  selectedLostReasons: Record<string, string>;
  onToggleOpen: () => void;
  onToggleContactAI: (phone: string, e: React.MouseEvent) => void;
  onRequestApproveAll: () => void;
  onRejectAll: () => void;
  onSelectLostReason: (suggestionId: string, reasonId: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

function formatPhone(phone: string) {
  if (!phone) return "";
  const clean = phone.replace(/\D/g, "");
  if (clean.length === 13) return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  if (clean.length === 12) return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`;
  return phone;
}

export function ContactGroupCard({
  group,
  isOpen,
  isContactDisabled,
  approvingThisGroup,
  rejectingThisGroup,
  approveProgress,
  anyExecuting,
  executingId,
  executionResults,
  lostReasons,
  selectedLostReasons,
  onToggleOpen,
  onToggleContactAI,
  onRequestApproveAll,
  onRejectAll,
  onSelectLostReason,
  onApprove,
  onReject,
}: ContactGroupCardProps) {
  return (
    <Collapsible open={isOpen} onOpenChange={onToggleOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={`w-full glass-card p-4 hover:bg-muted/50 transition-colors cursor-pointer rounded-lg ${
            isContactDisabled ? "opacity-50 border-dashed" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  isContactDisabled ? "bg-muted" : "bg-primary/10"
                }`}
              >
                <User
                  className={`w-5 h-5 ${
                    isContactDisabled ? "text-muted-foreground" : "text-primary"
                  }`}
                />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{group.contactName}</p>
                  {group.createdAt && (
                    <span
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                      title={format(new Date(group.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    >
                      <Calendar className="w-3 h-3" />
                      {format(new Date(group.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  )}
                </div>
                {group.contactPhone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {formatPhone(group.contactPhone)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {group.suggestions.length} sugestão{group.suggestions.length !== 1 ? "ões" : ""}
                </span>
                {group.pendingCount > 0 && (
                  <Badge variant="outline" className="text-xs font-medium border-primary/30 text-primary">
                    {group.pendingCount} pendente{group.pendingCount !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              {group.contactPhone && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${
                    isContactDisabled ? "text-muted-foreground" : "text-foreground"
                  }`}
                  onClick={(e) => onToggleContactAI(group.contactPhone, e)}
                  title={isContactDisabled ? "IA desativada para este contato" : "IA ativa para este contato"}
                >
                  <Power className="w-4 h-4" />
                </Button>
              )}
              {group.pendingCount > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 px-3"
                  disabled={approvingThisGroup || rejectingThisGroup || !!executingId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestApproveAll();
                  }}
                >
                  {approvingThisGroup ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      {approveProgress ? `${approveProgress.current}/${approveProgress.total}` : "..."}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Aceitar todas
                    </>
                  )}
                </Button>
              )}
              {group.pendingCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-muted-foreground hover:text-destructive"
                  disabled={rejectingThisGroup || approvingThisGroup}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRejectAll();
                  }}
                >
                  {rejectingThisGroup ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5 mr-1.5" /> Rejeitar todas
                    </>
                  )}
                </Button>
              )}
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 ml-[52px] flex-wrap">
            {group.integrationLabel && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Smartphone className="w-3 h-3" />
                <span className="font-medium text-foreground">{group.integrationLabel}</span>
              </span>
            )}
            {group.lastAssignedTo && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <UserCheck className="w-3 h-3" />
                <span className="font-medium text-foreground">{group.lastAssignedTo}</span>
              </span>
            )}
            {group.lastApprovedAt && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(group.lastApprovedAt), { addSuffix: true, locale: ptBR })}
              </span>
            )}
            {group.actionSummary.length > 0 && (
              <div className="flex items-center gap-1 ml-auto flex-wrap justify-end max-w-full">
                {group.actionSummary.map(({ type, count }) => (
                  <span
                    key={type}
                    className="inline-flex items-center whitespace-nowrap rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] leading-none font-medium text-muted-foreground"
                  >
                    {count}× {ACTION_TYPE_LABELS[type]?.split(" ")[0] || type}
                  </span>
                ))}
              </div>
            )}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <AnimatePresence>
          <div className="space-y-3 pl-4 border-l-2 border-primary/20 ml-5 mt-2 mb-2">
            {group.suggestions.map((suggestion, i) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                index={i}
                executionResult={executionResults[suggestion.id]}
                isExecuting={executingId === suggestion.id}
                anyExecuting={!!executingId}
                lostReasons={lostReasons}
                selectedLostReason={selectedLostReasons[suggestion.id]}
                onSelectLostReason={(reasonId) => onSelectLostReason(suggestion.id, reasonId)}
                onApprove={() => onApprove(suggestion.id)}
                onReject={() => onReject(suggestion.id)}
              />
            ))}
          </div>
        </AnimatePresence>
      </CollapsibleContent>
    </Collapsible>
  );
}
