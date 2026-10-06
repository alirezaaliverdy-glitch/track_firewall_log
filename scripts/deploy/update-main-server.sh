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
git merge --ff-only "$target_sha"

compose() {
  docker compose --project-name track_firewall_log -f docker-compose.firewall.yml "$@"
}

compose build firewall-web firewall-api
compose up -d --remove-orphans --wait --wait-timeout 300

if ! compose exec -T main-nginx wget -qO- http://127.0.0.1/firewall-api/health/ready | grep -q '"ready":true'; then
  echo "Deployment health check failed: API/database readiness is not healthy" >&2
  compose ps
  exit 1
fi
if ! compose exec -T main-nginx wget -q --spider http://127.0.0.1/firewall/dashboard; then
  echo "Deployment health check failed: dashboard did not return successfully" >&2
  compose ps
  exit 1
fi

printf '%s\n' "$target_sha" > .deploy/current-main-sha
echo "Production is healthy at main commit $target_sha"
