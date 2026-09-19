#!/usr/bin/env sh
set -eu

: "${COMPOSE_FILE:?Set COMPOSE_FILE}"
: "${FRONTEND_IMAGE_REPOSITORY:?Set FRONTEND_IMAGE_REPOSITORY}"
: "${BACKEND_IMAGE_REPOSITORY:?Set BACKEND_IMAGE_REPOSITORY}"

if [ ! -f .deploy/previous-version ]; then
  echo "No previous deployment version is recorded in .deploy/previous-version" >&2
  exit 1
fi

rollback_version="$(cat .deploy/previous-version)"
current_version=""
if [ -f .deploy/current-version ]; then
  current_version="$(cat .deploy/current-version)"
fi

export DEPLOY_VERSION="$rollback_version"
export FRONTEND_IMAGE="${FRONTEND_IMAGE_REPOSITORY}:${rollback_version}"
export BACKEND_IMAGE="${BACKEND_IMAGE_REPOSITORY}:${rollback_version}"

docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

if [ -n "$current_version" ] && [ "$current_version" != "$rollback_version" ]; then
  printf '%s\n' "$current_version" > .deploy/previous-version
fi

printf '%s\n' "$rollback_version" > .deploy/current-version
