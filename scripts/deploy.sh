#!/usr/bin/env bash
# Deploy a built static frontend to a Butterbase app.
#
# Usage:
#   BUTTERBASE_API_KEY=bb_sk_... ./scripts/deploy.sh <app_id> <build_dir> [framework]
#
# Examples:
#   ./scripts/deploy.sh app_3moov7i9bzwb out nextjs-static    # SocialButter (next export)
#   ./scripts/deploy.sh app_3moov7i9bzwb dist react-vite      # Vite build
#   ./scripts/deploy.sh app_3moov7i9bzwb public static        # Plain HTML
#
# framework: static | nextjs-static | react-vite | other  (default: static)
#
# Requirements:
#   - BUTTERBASE_API_KEY in env (https://app.butterbase.ai → API keys)
#   - zip + curl + jq installed
#
# What this does:
#   1. Zip the build dir (forward slashes — uses `zip` CLI, safe on macOS/Linux)
#   2. POST /v1/<app>/frontend/deployments  → get deployment_id + uploadUrl
#   3. PUT zip to uploadUrl  (R2 presigned, expires in 15 min)
#   4. POST /v1/<app>/frontend/deployments/<id>/start
#   5. Poll until READY (then poll the live URL until the new build serves —
#      Cloudflare edge can lag a few minutes after READY)

set -euo pipefail

APP_ID="${1:-}"
BUILD_DIR="${2:-}"
FRAMEWORK="${3:-static}"
API="${BUTTERBASE_ENDPOINT:-https://api.butterbase.ai}"

if [[ -z "$APP_ID" || -z "$BUILD_DIR" ]]; then
  echo "Usage: $0 <app_id> <build_dir> [framework]" >&2
  exit 2
fi
if [[ -z "${BUTTERBASE_API_KEY:-}" ]]; then
  echo "error: BUTTERBASE_API_KEY not set in env" >&2
  echo "       export BUTTERBASE_API_KEY=bb_sk_..." >&2
  exit 2
fi
if [[ ! -d "$BUILD_DIR" ]]; then
  echo "error: build dir '$BUILD_DIR' does not exist" >&2
  exit 2
fi
if [[ ! -f "$BUILD_DIR/index.html" ]]; then
  echo "warning: $BUILD_DIR/index.html not found — deploy may not serve correctly" >&2
fi
for cmd in zip curl jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "error: '$cmd' is required" >&2; exit 2; }
done

ZIP_PATH="$(mktemp -t butterbase-deploy.XXXXXX.zip)"
trap 'rm -f "$ZIP_PATH"' EXIT

echo "→ Zipping $BUILD_DIR/ → $ZIP_PATH"
(cd "$BUILD_DIR" && zip -rq "$ZIP_PATH" .)
SIZE=$(wc -c <"$ZIP_PATH" | tr -d ' ')
echo "  $SIZE bytes"

echo "→ Creating deployment (framework=$FRAMEWORK) for $APP_ID"
CREATE_RES=$(curl -sS -X POST \
  "$API/v1/$APP_ID/frontend/deployments" \
  -H "Authorization: Bearer $BUTTERBASE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"framework\":\"$FRAMEWORK\"}")

DEPLOYMENT_ID=$(echo "$CREATE_RES" | jq -er '.id // .deployment_id')
UPLOAD_URL=$(echo "$CREATE_RES" | jq -er '.uploadUrl')
echo "  deployment_id=$DEPLOYMENT_ID"

echo "→ Uploading zip to R2"
UPLOAD_CODE=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/zip" \
  --data-binary "@$ZIP_PATH")
if [[ "$UPLOAD_CODE" != "200" ]]; then
  echo "error: upload failed (HTTP $UPLOAD_CODE)" >&2
  exit 1
fi

echo "→ Starting deployment"
START_RES=$(curl -sS -X POST \
  "$API/v1/$APP_ID/frontend/deployments/$DEPLOYMENT_ID/start" \
  -H "Authorization: Bearer $BUTTERBASE_API_KEY")

STATUS=$(echo "$START_RES" | jq -r '.status // ""')
URL=$(echo "$START_RES" | jq -r '.url // ""')
echo "  status=$STATUS url=$URL"

# Poll for READY (status endpoint, up to ~2 minutes)
for i in $(seq 1 24); do
  [[ "$STATUS" == "READY" || "$STATUS" == "ERROR" || "$STATUS" == "CANCELED" ]] && break
  sleep 5
  POLL=$(curl -sS \
    "$API/v1/$APP_ID/frontend/deployments/$DEPLOYMENT_ID" \
    -H "Authorization: Bearer $BUTTERBASE_API_KEY")
  STATUS=$(echo "$POLL" | jq -r '.status // ""')
  echo "  poll #$i: $STATUS"
done

if [[ "$STATUS" != "READY" ]]; then
  echo "error: deployment ended in status=$STATUS" >&2
  echo "$START_RES" | jq '.' >&2 || true
  exit 1
fi

echo
echo "✓ Deployed: $URL"
echo "  Note: Cloudflare edge propagation can take 1–5 minutes after READY."
echo "  Verify with: curl -sS $URL | head"
