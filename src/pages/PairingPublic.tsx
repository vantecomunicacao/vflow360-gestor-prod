import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, MessageSquare, ShieldAlert, Smartphone } from "lucide-react";

type State =
  | { kind: "loading" }
  | { kind: "qr"; qrcode: string | null; label: string | null }
  | { kind: "connected"; pairedName: string | null; pairedPhone: string | null }
  | { kind: "expired" }
  | { kind: "error" };

const POLL_INTERVAL_MS = 4000;

const PairingPublic = () => {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const isMountedRef = useRef(true);

  const validate = useCallback(async () => {
    if (!token) return;
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-pairing-public`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ token }),
      });
      const json = await response.json().catch(() => null);
      if (!isMountedRef.current) return;
      if (!json || json.ok === false) {
        setState({ kind: "expired" });
        return;
      }
      if (json.status === "connected") {
        setState({
          kind: "connected",
          pairedName: json.paired_name ?? null,
          pairedPhone: json.paired_phone ?? null,
        });
        return;
      }
      setState({ kind: "qr", qrcode: json.qrcode ?? null, label: json.label ?? null });
    } catch {
      if (isMountedRef.current) setState({ kind: "error" });
    }
  }, [token]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setState({ kind: "expired" });
      return;
    }
    validate();
  }, [token, validate]);

  useEffect(() => {
    if (state.kind === "connected" || state.kind === "expired") return;
    const interval = setInterval(validate, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [state.kind, validate]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <div className="flex items-center gap-2 text-foreground">
          <MessageSquare className="w-6 h-6 text-success" />
          <span className="text-lg font-semibold">Conectar WhatsApp</span>
        </div>

        {state.kind === "loading" && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </div>
        )}

        {state.kind === "qr" && (
          <div className="w-full bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-5">
            {state.label && (
              <p className="text-xs text-muted-foreground text-center">
                Conta: <span className="font-medium text-foreground">{state.label}</span>
              </p>
            )}

            <div className="w-full max-w-[280px] aspect-square bg-background rounded-lg border border-border flex items-center justify-center overflow-hidden">
              {state.qrcode ? (
                <img
                  src={state.qrcode.startsWith("data:") ? state.qrcode : `data:image/png;base64,${state.qrcode}`}
                  alt="QR Code"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">Gerando QR Code...</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Aguardando conexão...
            </div>

            <div className="w-full bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-1">
                <Smartphone className="w-4 h-4" /> Como conectar
              </div>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
                <li>Abra o WhatsApp no seu celular</li>
                <li>Toque em <span className="font-medium text-foreground">Mais opções</span> ou <span className="font-medium text-foreground">Configurações</span></li>
                <li>Toque em <span className="font-medium text-foreground">Dispositivos conectados</span> → <span className="font-medium text-foreground">Conectar um dispositivo</span></li>
                <li>Aponte a câmera para este QR Code</li>
              </ol>
            </div>
          </div>
        )}

        {state.kind === "connected" && (
          <div className="w-full bg-card border border-border rounded-xl p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-success" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">WhatsApp conectado!</h2>
              {(state.pairedName || state.pairedPhone) && (
                <div className="mt-3 space-y-0.5">
                  {state.pairedName && (
                    <p className="text-base font-medium text-foreground">{state.pairedName}</p>
                  )}
                  {state.pairedPhone && (
                    <p className="text-sm text-muted-foreground">{state.pairedPhone}</p>
                  )}
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-3">Você pode fechar esta janela.</p>
            </div>
          </div>
        )}

        {state.kind === "expired" && (
          <div className="w-full bg-card border border-border rounded-xl p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="w-9 h-9 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Link inválido ou expirado</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Solicite um novo link à pessoa responsável.
              </p>
            </div>
          </div>
        )}

        {state.kind === "error" && (
          <div className="w-full bg-card border border-border rounded-xl p-8 flex flex-col items-center gap-4 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Não foi possível conectar. Tentando novamente...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PairingPublic;