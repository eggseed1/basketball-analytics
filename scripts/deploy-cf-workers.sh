#!/usr/bin/env bash
# Deploy fat OpenNext origin, then thin edge Worker (custom-domain name).
# Usage: after `npx opennextjs-cloudflare build`
set -euo pipefail

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "::error title=Missing deploy token::CLOUDFLARE_API_TOKEN is empty."
  exit 1
fi

echo "=== Deploy origin (OpenNext) ==="
npx wrangler deploy -c wrangler.origin.jsonc 2>&1 | tee /tmp/deploy-origin.log

echo "=== Deploy thin edge (custom domain) ==="
npx wrangler deploy -c wrangler.jsonc 2>&1 | tee /tmp/deploy.log

echo "Origin upload:" "$(grep -oE 'Total Upload: [0-9.]+ KiB' /tmp/deploy-origin.log | head -1 || echo unknown)"
echo "Edge upload:" "$(grep -oE 'Total Upload: [0-9.]+ KiB' /tmp/deploy.log | head -1 || echo unknown)"
