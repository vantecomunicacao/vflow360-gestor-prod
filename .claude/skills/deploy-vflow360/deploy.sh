#!/usr/bin/env bash
# Deploy driver for vflow360.
# Run from the repo root: vflow360/
#
# Subcommands:
#   diagnose            — show what changed, separating edge functions / frontend / migrations
#   check               — npx tsc --noEmit (must pass before any deploy)
#   edge <name>         — deploy ONE supabase function
#   edge-changed        — deploy ONLY edge functions modified vs HEAD
#   edge-list           — list deployed edge functions and versions on the remote
#   build               — vite production build (dist/)
#   frontend            — STUB: prints what would happen; host TBD by user
#
# Project ref is hard-coded — vflow360 only ever talks to one Supabase project
# (memory: "Supabase só VFlow-2.0"). Do NOT pass --project-ref interactively;
# if you ever need a different ref, edit this file.
set -euo pipefail

PROJECT_REF="xcrfbpyhyznyufijrdry"
COOLIFY_APP_UUID="hs0h8xhna2u1bvopc4ylpuyf"
COOLIFY_APP_FQDN="https://gestor.vflow360.com.br"
GIT_REMOTE="origin"
GIT_BRANCH="main"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

# Sanity: we must be in vflow360/
[[ -f "package.json" && -d "supabase/functions" ]] || {
  echo "ERROR: run from vflow360/ root (expected package.json + supabase/functions/)" >&2
  exit 2
}

cmd="${1:-help}"
shift || true

# ──────────────────────────────────────────────────────────────────────────
# diagnose — what's dirty, grouped
# ──────────────────────────────────────────────────────────────────────────
if [[ "$cmd" == "diagnose" ]]; then
  echo "── git status (grouped by area) ─────────────────────────────────"
  echo
  echo "▶ Edge functions:"
  git status --short -- supabase/functions/ 2>/dev/null | sed 's/^/  /' || echo "  (clean)"
  echo
  echo "▶ Frontend (src/):"
  git status --short -- src/ 2>/dev/null | sed 's/^/  /' || echo "  (clean)"
  echo
  echo "▶ Migrations:"
  git status --short -- supabase/migrations/ 2>/dev/null | sed 's/^/  /' || echo "  (clean)"
  echo
  echo "▶ Config / infra:"
  git status --short -- supabase/config.toml Dockerfile nginx.conf vite.config.ts 2>/dev/null | sed 's/^/  /' || echo "  (clean)"
  echo
  echo "▶ Other (be careful — may be WIP from another session):"
  git status --short | grep -vE '^.. (supabase/(functions|migrations|config\.toml)|src/|Dockerfile|nginx\.conf|vite\.config\.ts)' | sed 's/^/  /' || echo "  (none)"
  echo
  echo "── current branch / HEAD ──────────────────────────────────────────"
  git branch --show-current
  git log --oneline -3
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────
# check — type-check; MUST pass before any deploy
# ──────────────────────────────────────────────────────────────────────────
if [[ "$cmd" == "check" ]]; then
  echo "▶ Type-check (tsc --noEmit)..."
  npx tsc --noEmit
  echo "✓ type-check passed"
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────
# edge <name> — deploy single function
# ──────────────────────────────────────────────────────────────────────────
if [[ "$cmd" == "edge" ]]; then
  fn="${1:-}"
  [[ -n "$fn" ]] || { echo "usage: deploy.sh edge <function-name>" >&2; exit 2; }
  [[ -d "supabase/functions/$fn" ]] || { echo "ERROR: supabase/functions/$fn does not exist" >&2; exit 2; }
  echo "▶ Deploying edge function '$fn' to project $PROJECT_REF..."
  npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
  echo "✓ deployed: $fn"
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────
# edge-changed — deploy every function with uncommitted changes
# ──────────────────────────────────────────────────────────────────────────
if [[ "$cmd" == "edge-changed" ]]; then
  # Functions with modified files (committed or not) — diff against HEAD
  mapfile -t changed < <(
    {
      git diff --name-only HEAD -- supabase/functions/
      git ls-files --others --exclude-standard -- supabase/functions/
    } | awk -F/ '/^supabase\/functions\//{print $3}' | sort -u | grep -v '^_shared$' || true
  )
  if [[ ${#changed[@]} -eq 0 ]]; then
    echo "No edge function changes since HEAD. Nothing to deploy."
    exit 0
  fi
  echo "▶ Functions changed since HEAD:"
  printf '  - %s\n' "${changed[@]}"
  echo
  read -r -p "Deploy all of these? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || { echo "aborted"; exit 1; }
  for fn in "${changed[@]}"; do
    echo
    echo "▶ Deploying $fn..."
    npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
  done
  echo
  echo "✓ deployed ${#changed[@]} function(s)"
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────
# edge-list — what's on the remote
# ──────────────────────────────────────────────────────────────────────────
if [[ "$cmd" == "edge-list" ]]; then
  npx supabase functions list --project-ref "$PROJECT_REF"
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────
# build — vite production build
# ──────────────────────────────────────────────────────────────────────────
if [[ "$cmd" == "build" ]]; then
  echo "▶ vite build..."
  npm run build
  echo "✓ dist/ ready"
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────
# frontend — push selected files to git; Coolify deploy is triggered by the
# Claude agent via the `coolify` MCP (deploy tool, app UUID hard-coded above).
# This script intentionally does NOT call the Coolify API directly — the MCP
# is the supported path and gives the agent visibility into deploy logs.
# ──────────────────────────────────────────────────────────────────────────
if [[ "$cmd" == "frontend" ]]; then
  # Sanity: must be on the deploy branch
  current_branch="$(git branch --show-current)"
  if [[ "$current_branch" != "$GIT_BRANCH" ]]; then
    echo "ERROR: on branch '$current_branch', deploy expects '$GIT_BRANCH'" >&2
    exit 2
  fi

  # Type-check first (gate)
  echo "▶ Type-check..."
  npx tsc --noEmit
  echo "✓ type-check passed"
  echo

  # Show what would be pushed
  echo "── what's about to ship ─────────────────────────────────────────"
  if ! git diff --quiet HEAD; then
    echo "▶ Tracked file changes:"
    git diff --stat HEAD | sed 's/^/  /'
  fi
  if git ls-files --others --exclude-standard | grep -q .; then
    echo "▶ Untracked files (NOT in commit unless you add them manually):"
    git ls-files --others --exclude-standard | sed 's/^/  /'
  fi
  if git log "$GIT_REMOTE/$GIT_BRANCH..HEAD" --oneline 2>/dev/null | grep -q .; then
    echo "▶ Local commits ahead of $GIT_REMOTE/$GIT_BRANCH:"
    git log "$GIT_REMOTE/$GIT_BRANCH..HEAD" --oneline | sed 's/^/  /'
  fi
  echo
  echo "This command will NOT auto-commit. Stage & commit the files you want shipped first."
  echo "Then re-run, and it will push to $GIT_REMOTE/$GIT_BRANCH."
  echo

  # We trust git: whatever is committed is what gets shipped. Dirty files
  # outside of HEAD are fine — this repo lives with long-running cross-session
  # WIP, and forcing a clean tree would block every deploy.
  ahead=$(git rev-list --count "$GIT_REMOTE/$GIT_BRANCH..HEAD" 2>/dev/null || echo 0)
  if [[ "$ahead" -eq 0 ]]; then
    echo "Nothing to push — $GIT_BRANCH already matches $GIT_REMOTE/$GIT_BRANCH."
    echo "If you just want to trigger a rebuild without code changes, use:"
    echo "  → Claude: invoke MCP tool coolify.deploy with tag_or_uuid=$COOLIFY_APP_UUID"
    exit 0
  fi

  read -r -p "Push $ahead commit(s) to $GIT_REMOTE/$GIT_BRANCH? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || { echo "aborted"; exit 1; }

  git push "$GIT_REMOTE" "$GIT_BRANCH"
  echo
  echo "✓ pushed. Coolify auto-deploys on push if the GitHub App webhook is wired."
  echo
  echo "To force a manual deploy (or if webhook isn't set), the agent should run:"
  echo "  MCP tool: coolify.deploy  →  tag_or_uuid=$COOLIFY_APP_UUID"
  echo
  echo "To watch logs:"
  echo "  MCP tool: coolify.deployment(action=list_for_app, uuid=$COOLIFY_APP_UUID)"
  echo "  then:    coolify.deployment(action=get, uuid=<deployment_uuid>, lines=150)"
  echo
  echo "Once finished, verify with:"
  echo "  curl -sS -o /dev/null -w '%{http_code}\\n' $COOLIFY_APP_FQDN/"
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────
# verify — quick smoke against the live URL
# ──────────────────────────────────────────────────────────────────────────
if [[ "$cmd" == "verify" ]]; then
  echo "▶ GET $COOLIFY_APP_FQDN/ ..."
  code=$(curl -sS -o /tmp/vflow360.verify.html -w "%{http_code}" "$COOLIFY_APP_FQDN/" --max-time 15)
  echo "HTTP $code"
  [[ "$code" == "200" ]] || { echo "FAIL"; exit 1; }
  title=$(grep -oE '<title>[^<]*</title>' /tmp/vflow360.verify.html || true)
  echo "Title: $title"
  echo "✓ live"
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────
# help / unknown
# ──────────────────────────────────────────────────────────────────────────
cat <<EOF
deploy.sh — vflow360 deploy driver

Edge functions (Supabase $PROJECT_REF):
  diagnose          show git changes grouped by area
  check             type-check (tsc --noEmit) — gate before any deploy
  edge <name>       deploy ONE supabase function
  edge-changed      deploy all functions modified since HEAD
  edge-list         list functions deployed on $PROJECT_REF

Frontend (Coolify app $COOLIFY_APP_UUID → $COOLIFY_APP_FQDN):
  build             vite production build → dist/ (local check, not needed for deploy)
  frontend          type-check → show diff → push to $GIT_REMOTE/$GIT_BRANCH
                    Coolify auto-deploys on push (or use MCP coolify.deploy)
  verify            curl $COOLIFY_APP_FQDN/ — confirm HTTP 200 + title

Typical session:
  ./deploy.sh diagnose            # what changed?
  ./deploy.sh edge ai-analyze     # ship edge function changes
  git add src/foo.tsx && git commit -m "..."
  ./deploy.sh frontend            # push + Coolify rebuilds
  ./deploy.sh verify              # confirm
EOF