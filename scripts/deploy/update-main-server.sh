#!/usr/bin/env sh
set -eu

deploy_path=${1:?Deployment directory is required}
target_sha=${2:?Verified commit SHA is required}

case "$deploy_path" in
  /*) ;;
  *) echo "Deployment path must be absolute" >&2; exit 2 ;;
esac
case "$target_sha" in
  *[!0-9a-f]*|'') echo "Commit SHA must be a full lowercase Git SHA" >&2; exit 2 ;;
esac
[ "${#target_sha}" -eq 40 ] || { echo "Commit SHA must be 40 characters" >&2; exit 2; }

cd "$deploy_path"
[ "$(git rev-parse --show-toplevel)" = "$(pwd -P)" ] || {
  echo "Deployment path is not the repository root" >&2
  exit 2
}
[ "$(git branch --show-current)" = "main" ] || {
  echo "Deployment checkout must be on the main branch" >&2
  exit 2
}
case "$(git remote get-url origin)" in
  https://github.com/alirezaaliverdy-glitch/track_firewall_log.git|git@github.com:alirezaaliverdy-glitch/track_firewall_log.git) ;;
  *) echo "Unexpected origin repository; refusing deployment" >&2; exit 2 ;;
esac

mkdir -p .deploy
exec 9>.deploy/main-deploy.lock
flock -x 9

git fetch --quiet origin main
remote_sha=$(git rev-parse refs/remotes/origin/main)
if [ "$remote_sha" != "$target_sha" ]; then
  echo "Deployment skipped: this CI run was superseded by a newer main commit."
  exit 0
fi

git diff --quiet && git diff --cached --quiet || {
  echo "Tracked server-side edits exist; refusing to overwrite them" >&2
  exit 2
}

[ -f docker-compose.override.yml ] || {
  echo "Production Compose override is missing" >&2
  exit 2
}
[ -s Caddyfile.production.local ] || {
  echo "Server-local Caddyfile is missing" >&2
  exit 2
}
docker volume inspect firewall-soar_firewall_db_data >/dev/null 2>&1 || {
  echo "Existing production database volume was not found" >&2
  exit 2
}
command -v jq >/dev/null 2>&1 || {
  echo "jq is required to verify the production Caddy mount" >&2
  exit 2
}

git merge --ff-only "$target_sha"

compose() {
  docker compose --project-name firewall-soar -f docker-compose.yml -f docker-compose.override.yml "$@"
}

compose config --quiet
compose config --format json | jq -e --arg source "$(pwd -P)/Caddyfile.production.local" '
  .services.gateway.volumes
  | map(select(.target == "/etc/caddy/Caddyfile" and .source == $source))
  | length == 1
' >/dev/null || {
  echo "Gateway is not using the server-local Caddyfile" >&2
  exit 2
}
compose run --rm --no-deps gateway caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# Keep the runner's SSH channel active during a slow first-time Chromium build.
(
  while sleep 30; do
    echo "Production image build is still running..."
  done
) &
heartbeat_pid=$!
trap 'kill "$heartbeat_pid" 2>/dev/null || true' EXIT

compose build firewall-web firewall-api
compose up -d --no-build --remove-orphans --wait --wait-timeout 300

if ! compose exec -T gateway wget --no-check-certificate -qO- https://127.0.0.1/firewall-api/health/ready | grep -q '"ready":true'; then
  echo "Deployment health check failed: API/database readiness is not healthy" >&2
  compose ps
  exit 1
fi
if ! compose exec -T gateway wget --no-check-certificate -q --spider https://127.0.0.1/firewall/dashboard; then
  echo "Deployment health check failed: dashboard did not return successfully" >&2
  compose ps
  exit 1
fi

printf '%s\n' "$target_sha" > .deploy/current-main-sha
echo "Production is healthy at main commit $target_sha"
