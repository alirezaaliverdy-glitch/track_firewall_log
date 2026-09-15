#!/usr/bin/env sh
set -eu

: "${COMPOSE_FILE:?Set COMPOSE_FILE}"
: "${DEPLOY_VERSION:?Set DEPLOY_VERSION}"
: "${FRONTEND_IMAGE:?Set FRONTEND_IMAGE}"
: "${BACKEND_IMAGE:?Set BACKEND_IMAGE}"

mkdir -p .deploy

previous_version=""
if [ -f .deploy/current-version ]; then
  previous_version="$(cat .deploy/current-version)"
fi

export FRONTEND_IMAGE
export BACKEND_IMAGE
export DEPLOY_VERSION

docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

if [ -n "$previous_version" ] && [ "$previous_version" != "$DEPLOY_VERSION" ]; then
  printf '%s\n' "$previous_version" > .deploy/previous-version
fi

printf '%s\n' "$DEPLOY_VERSION" > .deploy/current-version
