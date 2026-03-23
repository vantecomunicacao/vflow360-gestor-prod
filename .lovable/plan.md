

# Plano de Implementacao - Copiloto GHL

O sistema atual e 100% frontend com dados mockados. Para funcionar de verdade, precisamos construir em etapas. Abaixo esta o roteiro completo, ordenado por prioridade e dependencia.

---

## Etapa 1 - Backend e Autenticacao (base de tudo)

**O que**: Ativar o Lovable Cloud (Supabase) para ter banco de dados, autenticacao e edge functions.

- Criar tabelas: `profiles`, `user_roles`, `integrations`, `conversations`, `messages`, `suggestions`
- Implementar login/registro real com Supabase Auth (email + senha)
- Proteger rotas autenticadas (redirecionar para /login se nao logado)
- Criar pagina `/reset-password` para recuperacao de senha funcional

**Por que primeiro**: Nada funciona sem usuarios reais e banco de dados.

---

## Etapa 2 - Integracao WhatsApp (Uazap)

**O que**: Conectar o WhatsApp real via API do Uazap.

- Criar edge function para gerar QR Code real do Uazap
- Criar webhook para receber mensagens do WhatsApp em tempo real
- Salvar mensagens recebidas na tabela `messages`
- Atualizar a tela de Integracoes para exibir QR Code real e status da conexao
- Atualizar a tela de Conversas para mostrar mensagens reais do banco

**Por que**: E o canal de entrada de dados. Sem mensagens, nao ha o que analisar.

---

## Etapa 3 - Integracao Go High Level (GHL)

**O que**: Conectar ao CRM do Go High Level via API.

- Criar edge function para autenticar com a API do GHL (API Key + Location ID)
- Salvar credenciais GHL de forma segura (tabela `integrations` com RLS)
- Implementar sincronizacao de contatos, oportunidades e pipeline do GHL
- Permitir buscar campos personalizados e etapas do funil automaticamente
- Salvar mapeamentos de campos e etapas no banco

**Por que**: O GHL e o destino das acoes. Precisamos ler e escrever dados no CRM.

---

## Etapa 4 - Motor de IA (sugestoes automaticas)

**O que**: Analisar conversas com IA e gerar sugestoes de acao no CRM.

- Criar edge function que recebe uma conversa e gera sugestoes via Lovable AI ou OpenAI
- Usar o prompt configuravel + mapeamento de campos/etapas como contexto
- Salvar sugestoes na tabela `suggestions` com status (pendente/aprovada/rejeitada)
- Disparar analise automaticamente quando uma nova mensagem chega (webhook)
- Atualizar tela de Sugestoes para carregar dados reais

**Por que**: Este e o "cerebro" do sistema - o diferencial do produto.

---

## Etapa 5 - Execucao de acoes no GHL

**O que**: Quando o usuario aprova uma sugestao, executar a acao no GHL.

- Criar edge function que recebe uma sugestao aprovada e chama a API do GHL
- Acoes: atualizar campo, mover etapa do funil, criar nota, definir valor
- Registrar log de acoes executadas
- Feedback visual na tela (sugestao marcada como executada)

**Por que**: Fecha o ciclo - da conversa no WhatsApp ate a acao no CRM.

---

## Etapa 6 - Dashboard com dados reais

**O que**: Substituir dados mockados por consultas reais ao banco.

- Total de contatos, oportunidades e valores vindos do GHL
- Grafico de pipeline com dados reais
- Conversas recentes do banco
- Contagem de sugestoes pendentes

---

## Etapa 7 - Polimento e producao

- Onboarding funcional (salvar credenciais de verdade nos passos)
- Configuracoes de perfil e senha funcionais
- Notificacoes em tempo real (Supabase Realtime)
- Responsividade mobile
- Tratamento de erros e estados vazios

---

## Recomendacao de inicio

Comece pela **Etapa 1** (backend + autenticacao). Posso implementar agora:
1. Ativar Lovable Cloud
2. Criar as tabelas do banco
3. Implementar login/registro real
4. Proteger as rotas

Deseja que eu comece pela Etapa 1?

