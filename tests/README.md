# Testes End-to-End (Playwright)

Testes E2E da SPA VFlow360, rodando no Chromium contra o app real servido pelo
Vite — **mas com o backend Supabase 100% mockado na rede**.

## Por que o backend é mockado

O Supabase deste projeto é o **ambiente vivo de produção** (centenas de
mensagens/dia, conexões reais). Os E2E **não podem tocá-lo**. Duas camadas de
blindagem garantem isso:

1. **Host stub** — o `playwright.config.ts` sobe o dev server com
   `VITE_SUPABASE_URL=https://stub.supabase.co` (host que não resolve). Qualquer
   request não interceptado morre num host inexistente, nunca em produção.
2. **Mock de rede** — [`helpers/supabaseMock.ts`](helpers/supabaseMock.ts)
   intercepta toda chamada do supabase-js (auth, REST, RPC, edge functions e
   realtime) e devolve as respostas fixas de
   [`helpers/fixtures.ts`](helpers/fixtures.ts).

Consequência: os testes são determinísticos, rodam offline e nunca leem/escrevem
dados reais.

## Como rodar

```bash
npm run test:e2e          # roda toda a suíte (sobe o dev server sozinho)
npm run test:e2e:ui       # modo interativo (Playwright UI)
npm run test:e2e:report   # abre o último relatório HTML
npx playwright test auth.spec.ts        # um arquivo
npx playwright test -g "vendedor"       # por nome
```

> Na primeira vez: `npx playwright install chromium`.

O dev server de teste usa a porta **8090** (separada da 8080 local) justamente
para nunca reaproveitar um servidor apontado ao Supabase real.

## O que é coberto

| Arquivo | Cobertura |
|---|---|
| [`auth.spec.ts`](auth.spec.ts) | Login gestor/vendedor, redirect de não-autenticado, `GestorGuard` e `PermissionGuard`, erro de credenciais, logout. |
| [`navigation.spec.ts`](navigation.spec.ts) | Smoke: cada rota de gestor abre pela sidebar, sem exceções. |
| [`suggestions.spec.ts`](suggestions.spec.ts) | Fluxo do vendedor em /suggestions: lista, busca e estado vazio. |
| [`conversations-integrations.spec.ts`](conversations-integrations.spec.ts) | Conversas 2.0, Integrações e pareamento público (`/conectar/:token`, QR e expirado). |

## Convenções

- **Sempre** comece o teste com `installSupabaseMocks(page, { role })` e, para
  rotas autenticadas, `loginAs(page, role)`.
- Papéis: `gestor` (vê tudo + admin) e `vendedor` (`isSuggestionsOnly` → só
  /suggestions). O papel é decidido pelo retorno mockado de `get_my_permissions`.
- **Navegue por clique** (roteamento client-side), não por `page.goto`, em rotas
  protegidas por `PermissionGuard` — veja a observação abaixo.
- Para mudar dados de um teste específico, registre um `page.route` extra
  **depois** de `installSupabaseMocks` (o mais recente vence no Playwright).

## Observação: corrida de permissões no reload

Um `page.goto` (reload completo) direto numa rota protegida por `PermissionGuard`
(`/integrations`, `/suggestions`, `/settings/*`) pode redirecionar para
`/dashboard`: no boot há uma janela em que `PermissionsProvider` reporta
`loading=false` com permissões DEFAULT (durante a transição `user=null→presente`
do `AuthContext`), e o guard navega antes das permissões reais chegarem.

Na navegação normal do app (client-side, sem reload) isso não acontece, porque as
permissões já estão carregadas — por isso os testes navegam por clique. **Isso
parece ser um comportamento real do app** (dar F5 em `/integrations` como gestor
te tira da página); vale avaliar corrigir o `PermissionsProvider` para manter
`loading=true` até resolver as permissões do usuário logado.
