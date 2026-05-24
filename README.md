# VFlow360 2.0

Dashboard e copiloto IA da Vante Comunicação para o CRM. Frontend Vite/React, backend em Supabase (project ref `xcrfbpyhyznyufijrdry`).

## Estrutura

- `src/` — frontend Vite/React (shadcn/ui, Tailwind, React Query)
- `supabase/functions/` — edge functions (Deno)
- `supabase/migrations/` — migrations do banco
- `Dockerfile` — build multi-stage (node:20 → nginx:alpine) servindo SPA na porta 80

## Desenvolvimento

```bash
npm install
npm run dev          # http://localhost:8080
npm run build        # produz dist/
npx tsc --noEmit     # type-check
```

## Deploy

Use a skill `/deploy-vflow360` (definida em [`.claude/skills/deploy-vflow360/`](.claude/skills/deploy-vflow360/)). Cobre edge functions e frontend (Coolify), com diagnose, type-check, e verify integrados.

Produção: <https://gestor.vflow360.com.br>
