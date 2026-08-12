// Dados e identidades de teste para os E2E.
// Nada aqui toca o Supabase real — é tudo devolvido pelos mocks de rede.

export type Role = "gestor" | "vendedor";

const now = () => new Date().toISOString();
const epochIn = (secs: number) => Math.floor(Date.now() / 1000) + secs;

// ---------------------------------------------------------------------------
// Identidade / sessão (formato GoTrue, o que o supabase-js espera)
// ---------------------------------------------------------------------------

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// JWT "de mentira" mas estruturalmente válido, para o supabase-js conseguir
// decodificar exp/sub sem erro.
function fakeJwt(sub: string): string {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    sub,
    aud: "authenticated",
    role: "authenticated",
    exp: epochIn(3600),
    iat: Math.floor(Date.now() / 1000),
  });
  return `${header}.${payload}.e2e-signature`;
}

export function userFor(role: Role) {
  const id = role === "gestor" ? "user-gestor-0001" : "user-vendedor-0001";
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: `${role}@vflow360.test`,
    email_confirmed_at: now(),
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: role === "gestor" ? "Gestor Teste" : "Vendedor Teste" },
    identities: [],
    created_at: now(),
    updated_at: now(),
  };
}

export function sessionFor(role: Role) {
  const user = userFor(role);
  return {
    access_token: fakeJwt(user.id),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: epochIn(3600),
    refresh_token: `e2e-refresh-${role}`,
    user,
  };
}

// ---------------------------------------------------------------------------
// Permissões (retorno do RPC get_my_permissions)
//   gestor   -> vê tudo + admin
//   vendedor -> "só sugestões" (isSuggestionsOnly === true)
// ---------------------------------------------------------------------------

export function permissionsFor(role: Role) {
  if (role === "gestor") {
    return {
      view_suggestions: true,
      view_integrations: true,
      view_settings: true,
      is_admin: true,
    };
  }
  return {
    view_suggestions: true,
    view_integrations: false,
    view_settings: false,
    is_admin: false,
  };
}

// ---------------------------------------------------------------------------
// Dados de tabelas (PostgREST / .from())
// ---------------------------------------------------------------------------

export const WORKSPACE_ID = "ws-e2e-0001";

export const workspaces = [
  {
    id: WORKSPACE_ID,
    name: "Workspace E2E",
    owner_id: "user-gestor-0001",
    created_at: now(),
    deleted_at: null,
    ai_analysis_enabled: true,
  },
];

export const suggestions = [
  {
    id: "sg-0001",
    type: "mover_funil",
    title: "Mover João para 'Negociação'",
    description: "Cliente demonstrou interesse claro em fechar.",
    status: "pending",
    action_data: {
      contact_name: "João Cliente",
      contact_phone: "+5511999990001",
      ghl_pipeline_name: "Vendas",
      ghl_stage_name: "Negociação",
    },
    created_at: now(),
    conversation_id: "cv-0001",
    ai_provider: "openai",
    conversations: { integration_label: "WhatsApp Comercial" },
  },
  {
    id: "sg-0002",
    type: "adicionar_nota",
    title: "Adicionar nota para Maria",
    description: "Registrar que prefere contato à tarde.",
    status: "pending",
    action_data: {
      contact_name: "Maria Lead",
      contact_phone: "+5511999990002",
    },
    created_at: now(),
    conversation_id: "cv-0002",
    ai_provider: "openai",
    conversations: { integration_label: "WhatsApp Comercial" },
  },
];

export const ghl_conversations = [
  {
    id: "cv-0001",
    ghl_conversation_id: "ghlcv-0001",
    contact_name: "João Cliente",
    contact_phone: "+5511999990001",
    contact_email: "joao@cliente.test",
    profile_photo_url: null,
    channel_type: "whatsapp",
    last_message_at: now(),
    last_message_body: "Quero fechar o plano anual.",
    last_message_direction: "inbound",
    unread_count: 2,
    assigned_ghl_user_id: "ghlu-1",
    workspace_id: WORKSPACE_ID,
  },
];

export const ghl_users = [
  { ghl_id: "ghlu-1", name: "Vendedor Teste", workspace_id: WORKSPACE_ID },
];

export const integrations = [
  {
    id: "int-0001",
    workspace_id: WORKSPACE_ID,
    provider: "evolution",
    label: "WhatsApp Comercial",
    status: "connected",
    instance_name: "comercial",
    created_at: now(),
  },
];

// Mapa tabela -> linhas. Tabelas não listadas devolvem [].
export function tableRows(table: string): unknown[] {
  switch (table) {
    case "workspaces":
      return workspaces;
    case "suggestions":
      return suggestions;
    case "conversations":
    case "ghl_conversations":
      return ghl_conversations;
    case "ghl_users":
      return ghl_users;
    case "integrations":
      return integrations;
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// RPCs (.rpc())
// ---------------------------------------------------------------------------

export function rpcResult(fn: string, role: Role): unknown {
  switch (fn) {
    case "get_my_permissions":
      return [permissionsFor(role)];
    case "create_workspace":
      return "ws-e2e-novo";
    case "list_workspace_members":
      return [];
    case "add_workspace_member":
    case "remove_workspace_member":
      return null;
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Edge functions (functions.invoke / fetch direto)
// ---------------------------------------------------------------------------

// Payload da edge function "ghl-dashboard" (formato DashboardData). Números
// fixos e pequenos — o que importa nos E2E é a tela renderizar com filtros.
export function dashboardData() {
  const empty = { count: 0, percentage: 0 };
  return {
    totalLeads: 10,
    lostLeads: 2,
    funnelStages: [
      { id: "contato_inicial", name: "Contato Inicial", count: 10, currentCount: 4 },
      { id: "proposta_enviada", name: "Proposta Enviada", count: 6, currentCount: 3 },
      { id: "fechamento", name: "Fechamento", count: 4, currentCount: 2 },
      { id: "venda_ganha", name: "Venda Ganha", count: 3, currentCount: 3 },
    ],
    conversionRates: {
      contatoToProsposta: 60,
      propostaToFechamento: 66.7,
      fechamentoToVenda: 75,
      overallConversion: 30,
    },
    sellers: [
      {
        id: "ghlu-1",
        name: "Vendedor Teste",
        contatoInicial: 10,
        propostaEnviada: 6,
        fechamento: 4,
        vendaGanha: 3,
        total: 10,
      },
    ],
    leadOrigins: [],
    origemDistribution: [],
    origemFillRate: 0,
    wonOrigemDistribution: [],
    wonOrigemFillRate: 0,
    utmSourceDistribution: [],
    utmSourceFillRate: 0,
    utmSourceValues: [],
    utmMediumDistribution: [],
    utmMediumFillRate: 0,
    utmMediumValues: ["cpc"],
    utmCampaignDistribution: [],
    utmCampaignFillRate: 0,
    utmCampaignValues: ["campanha-teste"],
    wonUtmSourceDistribution: [],
    wonUtmSourceFillRate: 0,
    leadsOriginDistribution: [{ name: "Instagram", ...empty, count: 6, percentage: 60 }],
    leadsOriginFillRate: 100,
    wonOriginDistribution: [{ name: "Instagram", ...empty, count: 3, percentage: 100 }],
    wonOriginFillRate: 100,
    utmConfigured: { source: true, medium: true, campaign: true, content: false, term: false },
    customFields: [],
    customFieldDistributions: [],
    averageTimePerStage: { contatoInicial: 1, propostaEnviada: 2, fechamento: 3 },
    dailyLeads: [{ date: "2026-08-10", count: 5, dayName: "seg" }],
    pipelines: [
      {
        id: "pipe-1",
        name: "Funil de Vendas",
        stages: [
          { id: "stage-1", name: "Contato Inicial" },
          { id: "stage-2", name: "Proposta Enviada" },
        ],
      },
    ],
    users: [{ id: "ghlu-1", name: "Vendedor Teste" }],
    origins: ["Instagram"],
    overallFillRate: 100,
    lossReasons: [],
    totalMonetary: 10000,
    wonMonetary: 6000,
    negotiatingMonetary: 4000,
    cachedAt: now(),
    additionalDateFieldId: null,
    additionalDateFieldName: null,
    additionalDateFieldId2: null,
    additionalDateFieldName2: null,
    responseTime: null,
    coolingLeads: null,
  };
}

export function edgeResult(fn: string): unknown {
  switch (fn) {
    case "evolution-pairing-public":
      // 1x1 PNG transparente como QR de teste
      return {
        ok: true,
        status: "qr",
        qrcode:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
        label: "WhatsApp Comercial",
      };
    case "ghl-dashboard":
      return dashboardData();
    default:
      return { ok: true };
  }
}
