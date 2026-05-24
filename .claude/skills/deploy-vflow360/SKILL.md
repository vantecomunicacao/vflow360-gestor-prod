---
name: deploy-vflow360
description: Deploy vflow360 — Supabase edge functions and frontend (Coolify). Use when the user says deploy, push to prod, ship, publish, atualizar produção, subir edge function, or deployar.
---

Deploy driver for vflow360. Drive it via `.claude/skills/deploy-vflow360/deploy.sh` from the repo root (`vflow360/`).

All paths below are relative to `vflow360/`.

## AUTHORIZED ASSETS — DO NOT TOUCH ANY OTHER

This project may **only** operate on these assets. Every other GitHub repo and every other Coolify project is off-limits, even if the token sees them.

| Resource | Value |
|---|---|
| **GitHub repo** | `vantecomunicacao/vflow360-gestor-prod` (branch `main`) |
| **Coolify URL** | `http://72.60.248.166:8000` |
| **Coolify project** | `VFlow360-Gestor-prod` — UUID `akk4kccckcw880wswwgcwosg` |
| **Coolify env** | `production` — UUID `og8sssowow0ggg8wcwookwsk` |
| **Coolify app** | `VFlow360-Gestor-app` — UUID `sgow4kwws44g8k8c4k0g0kkc` |
| **Coolify server** | `localhost` — UUID `iv1aam857lorku90rp5dmppb` |
| **Public URL** | `https://gestor.vflow360.com.br` |
| **Supabase project ref** | `xcrfbpyhyznyufijrdry` |

A prior deploy went to the wrong Coolify project (`vflow360-2.0`) because the token in scope at that time could only see that one. The Coolify MCP for this repo is pinned in [.mcp.json](../../../../.mcp.json) at the repo root with a token scoped to the team that owns `VFlow360-Gestor-prod`.

**If any tool call resolves to a UUID/slug that is not in the table above — stop and ask the user. Never "try what looks right".**

## Other hard constraints, encoded in the driver

- `supabase/config.toml` has a stale `project_id` in some places — trust the driver, not the file.
- Build pack is `dockerfile` (multi-stage `node:20-alpine` → `nginx:alpine`, port 80). Coolify rebuilds the full image each push (~50s).
- Build-time env vars (baked into the JS bundle by Vite): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- This repo has long-lived WIP across sessions. Never `git add -A` or `git commit -am` blindly. Use `diagnose` first to separate session changes from inherited WIP.

## Prerequisites

Node + npm. Supabase CLI is invoked through `npx`:

```bash
node --version           # tested with v24
npx supabase --version   # tested with 2.101.0
```

Supabase CLI auth is one-time (`~/.supabase/`). If `npx supabase functions list` says "not logged in", run `npx supabase login` interactively once.

Coolify deploys are triggered via the `coolify` MCP (project-scoped, see `.mcp.json` at repo root). No local CLI needed. If the MCP token expires or loses scope, regenerate from `http://72.60.248.166:8000/security/api-tokens` while in the **team that owns `VFlow360-Gestor-prod`**, then replace `COOLIFY_ACCESS_TOKEN` in `.mcp.json` and restart Claude Code.

## Run (agent path)

Single bash script with subcommands. Always run from the unit root:

```bash
cd vflow360
./.claude/skills/deploy-vflow360/deploy.sh diagnose
```

| Subcommand | What it does |
|---|---|
| `diagnose` | git status grouped by area (edge functions / frontend / migrations / config / other). Read this BEFORE deciding what to deploy. The "Other" group flags WIP from other sessions. |
| `check` | `npx tsc --noEmit`. Gate before any deploy — abort if it fails. |
| `edge <name>` | Deploy ONE function: `./deploy.sh edge ai-analyze` |
| `edge-changed` | Deploy every function modified since HEAD (interactive y/N). Skips `_shared/`. |
| `edge-list` | List functions deployed on the remote with versions. Use to confirm. |
| `build` | `npm run build` (vite). Local check — not needed for deploy (Coolify builds from the Dockerfile). |
| `frontend` | Type-check → show diff → push to `origin/main`. Coolify auto-rebuilds on push. |
| `verify` | `curl https://gestor.vflow360.com.br/` — confirm HTTP 200 + `<title>`. |

### Edge function deploy

```bash
cd vflow360
./.claude/skills/deploy-vflow360/deploy.sh diagnose
./.claude/skills/deploy-vflow360/deploy.sh check
./.claude/skills/deploy-vflow360/deploy.sh edge ai-analyze
./.claude/skills/deploy-vflow360/deploy.sh edge-list   # confirm VERSION bumped
```

Success looks like:
```
Deployed Functions on project xcrfbpyhyznyufijrdry: ai-analyze
```

### Frontend deploy (Coolify)

1. **Stage and commit** only the files you want to ship. Inspect with `diagnose` first to keep WIP out.

   ```bash
   git add src/foo.tsx src/bar.tsx
   git commit -m "feat: ..."
   ```

2. **Push** via the driver — it gates on type-check and dirty working tree:

   ```bash
   ./.claude/skills/deploy-vflow360/deploy.sh frontend
   ```

3. **Trigger the rebuild** if the GitHub App webhook didn't auto-fire. The agent should call the MCP:

   ```
   coolify.deploy(tag_or_uuid="sgow4kwws44g8k8c4k0g0kkc")
   ```

4. **Watch logs** while it builds (~50s typical):

   ```
   coolify.deployment(action="list_for_app", uuid="sgow4kwws44g8k8c4k0g0kkc")
   coolify.deployment(action="get", uuid="<latest deployment_uuid>", lines=150)
   ```

5. **Verify** live:

   ```bash
   ./.claude/skills/deploy-vflow360/deploy.sh verify
   ```

   Should print `HTTP 200` and `<title>VFlow360 — Dashboard e Copiloto IA</title>`.

## Run (human path)

Same script, run by hand. Each subcommand is independent — no required ordering except `check`/type-check before deploys.

## Gotchas

- **`is_build_time` env var flag is rejected by the Coolify MCP** (`Validation failed. - is_build_time: This field is not allowed.`). Doesn't matter in practice: Coolify passes ALL env vars as `--build-arg` to the Dockerfile when the matching `ARG` is declared.
- **`supabase/config.toml` has a different `project_id` in some places.** Driver hard-codes `xcrfbpyhyznyufijrdry` and ignores the file.
- **`edge-changed` deploys functions in the order `ls` returns them.** Order rarely matters, but if one function depends on another at the API level (e.g. shared schema change), deploy the dependency first via `edge <name>`.
- **`_shared/` is filtered out of `edge-changed`.** It isn't a function — it's a library imported by the others. Editing it requires redeploying every dependent function manually.
- **Vite build warns about chunks > 500kB.** Currently `Dashboard` (~520kB) and main bundle (~770kB). Not a deploy blocker; not in scope for this skill.
- **Frontend deploy uses a Dockerfile, not nixpacks.** Coolify rebuilds the full image each push (~50s). The `dist/` artifact from `./deploy.sh build` is purely local — it's not what ships.

## Troubleshooting

- **`ERROR: run from vflow360/ root`**: you `cd`'d somewhere else. Driver requires `package.json` + `supabase/functions/` in the working dir.
- **`npx supabase functions deploy` hangs or fails with auth error**: run `npx supabase login` interactively. CLI keeps the token in `~/.supabase/`.
- **Type-check fails on files you didn't touch**: WIP from another session in `src/`. Run `diagnose`, decide whether to stash unrelated changes before deploying.
- **`./deploy.sh frontend` says `Nothing to push`**: local `main` matches `origin/main`. If you just want to force a rebuild (e.g. after env var change), call `coolify.deploy(tag_or_uuid="sgow4kwws44g8k8c4k0g0kkc")` directly.
- **Coolify MCP only sees the wrong projects**: token is scoped to the wrong team. Regenerate while logged into the team that owns `VFlow360-Gestor-prod` and update `.mcp.json`.
- **Coolify build fails with `permission denied` on git clone**: the GitHub App lost access to the repo. Re-grant it in GitHub Settings → Integrations.
- **`./deploy.sh verify` returns non-200**: check Coolify deployment status; if "finished" but the URL is down, the container may be unhealthy — look at `coolify.application_logs(uuid="sgow4kwws44g8k8c4k0g0kkc")`.
