#!/usr/bin/env sh
# Explicit --apply is required. Never delete business data, volumes or logs.
set -eu
mode=${1:---check}
case "$mode" in --check|--apply) ;; *) echo 'Usage: maintain-production-storage.sh [--check|--apply]' >&2; exit 2 ;; esac
cd "$(dirname "$0")/../.."
[ "$(git rev-parse --show-toplevel)" = "$(pwd -P)" ] || { echo 'Not the project checkout' >&2; exit 2; }
[ -f docker-compose.override.yml ] || { echo 'Production override missing' >&2; exit 2; }
mkdir -p .deploy
exec 9>.deploy/main-deploy.lock
if ! flock -n 9; then echo 'Storage maintenance skipped: deployment is active'; exit 0; fi
compose() { docker compose --project-name firewall-soar -f docker-compose.yml -f docker-compose.override.yml "$@"; }
if [ "$mode" = --apply ]; then
  web_container=$(compose ps -q firewall-web </dev/null)
  api_container=$(compose ps -q firewall-api </dev/null)
  [ -n "$web_container" ] && [ -n "$api_container" ] || { echo 'Application containers missing; no cleanup performed' >&2; exit 2; }
  web_image=$(docker inspect --format '{{.Image}}' "$web_container")
  api_image=$(docker inspect --format '{{.Image}}' "$api_container")
  # Identical old/current IDs preserve both running images. The shared helper
  # selects only positively labelled unused app images and private build cache.
  sh scripts/deploy/prune-production-images.sh "$web_image" "$api_image" "$web_image" "$api_image" </dev/null
fi
available_kb=$(df -Pk . | awk 'NR == 2 { print $4 }')
case "$available_kb" in ''|*[!0-9]*) echo 'Cannot determine available space' >&2; exit 2 ;; esac
printf 'storage_available_kib=%s minimum_kib=6291456 target_kib=8388608\n' "$available_kb"
if [ "$available_kb" -lt 6291456 ]; then
  echo 'STORAGE_LOW: add capacity; databases, uploads and evidence were not deleted' >&2
  exit 1
fi
if [ "$available_kb" -lt 8388608 ]; then echo 'STORAGE_WARNING: below preferred headroom; monitor growth'; fi
