/** Mensagens amigáveis para os erros que as edge functions devolvem por status. */
const FRIENDLY_ERROR: Record<string, string> = {
  Forbidden: "Você não tem acesso a esta conta.",
  Unauthorized: "Sessão expirada. Entre novamente.",
  "Missing authorization": "Sessão expirada. Entre novamente.",
};

/** Lê o corpo JSON de uma resposta de erro da edge function para recuperar a
 *  mensagem real (o supabase-js só expõe "non-2xx status code"). */
export async function extractFunctionError(error: Error & { context?: unknown }): Promise<string> {
  const res = error.context;
  if (res instanceof Response) {
    try {
      const body = await res.clone().json();
      const raw = (body as { error?: string })?.error;
      if (raw) return FRIENDLY_ERROR[raw] || raw;
    } catch {
      // corpo vazio ou não-JSON: fica com a mensagem original
    }
  }
  return error.message;
}
