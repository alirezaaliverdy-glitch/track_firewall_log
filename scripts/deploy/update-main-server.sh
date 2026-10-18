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
available_kb=$(df -Pk . | awk 'NR == 2 { print $4 }')
case "$available_kb" in
  ''|*[!0-9]*) echo "Cannot determine free space for production build" >&2; exit 2 ;;
esac
if [ "$available_kb" -lt 6291456 ]; then
  echo "Less than 6 GiB free; trimming only reclaimable BuildKit cache before deployment"
  docker buildx prune --force --filter 'private=""' --max-used-space 512mb --min-free-space 8gb
  available_kb=$(df -Pk . | awk 'NR == 2 { print $4 }')
fi
case "$available_kb" in
  ''|*[!0-9]*) echo "Cannot determine free space after cache cleanup" >&2; exit 2 ;;
esac
[ "$available_kb" -ge 6291456 ] || {
  echo "Production build needs at least 6 GiB free after cache cleanup; expand disk before deploying" >&2
  exit 2
}

compose() {
  docker compose --project-name firewall-soar -f docker-compose.yml -f docker-compose.override.yml "$@"
}

# A legacy database can have AppUser owned by postgres while the API migrates
# as firewall_app. Check before replacing a healthy API container: Prisma cannot
# ALTER a table owned by another role, and a failed startup would cause outage.
if git cat-file -e "$target_sha:backend/prisma/migrations/20261009090000_managed_user_workspace_scope/migration.sql" 2>/dev/null; then
  migration_access=$(compose exec -T firewall-db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"SELECT CASE WHEN EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261009090000_managed_user_workspace_scope' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) OR EXISTS (SELECT 1 FROM pg_tables t JOIN pg_roles r ON r.rolname = current_user WHERE t.schemaname = 'public' AND t.tablename = 'AppUser' AND (t.tableowner = current_user OR r.rolsuper)) THEN 'ready' ELSE 'owner_mismatch' END\"" </dev/null) || {
    echo "Cannot verify AppUser migration ownership; leaving the running deployment unchanged" >&2
    exit 2
  }
  [ "$migration_access" = ready ] || {
    echo "AppUser migration requires its table owner or a DB superuser; leaving the running deployment unchanged" >&2
    exit 2
  }
fi
if git cat-file -e "$target_sha:backend/prisma/migrations/20261012150000_camera_workspace/migration.sql" 2>/dev/null; then
  # docker exec does not inherit exports made by docker-entrypoint.sh. Resolve
  # the same URL-or-POSTGRES_USER role without reading the password files.
  camera_migration_role=$(git show "$target_sha:scripts/deploy/read-api-migration-role.mjs" | compose exec -T firewall-api node) || {
    echo "Cannot determine the API migration role; leaving the running deployment unchanged" >&2
    exit 2
  }
  case "$camera_migration_role" in
    ''|*[!a-zA-Z0-9_]*) echo "Unsupported API role name for migration preflight; leaving the running deployment unchanged" >&2; exit 2 ;;
  esac
  camera_migration_access=$(compose exec -T firewall-db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"SELECT CASE WHEN EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261012150000_camera_workspace' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) OR (has_schema_privilege('$camera_migration_role', 'public', 'CREATE') AND has_column_privilege('$camera_migration_role', 'public.' || quote_ident('AppUser'), 'id', 'REFERENCES')) THEN 'ready' ELSE 'camera_migration_permission_missing' END\"" </dev/null) || {
    echo "Cannot verify camera migration permissions; leaving the running deployment unchanged" >&2
    exit 2
  }
  [ "$camera_migration_access" = ready ] || {
    echo "Camera migration needs schema CREATE and AppUser(id) REFERENCES for the migration role. Apply scripts/deploy/prepare-camera-migration.sql as the table owner if REFERENCES is missing; leaving the running deployment unchanged" >&2
    exit 2
  }
fi
if git cat-file -e "$target_sha:backend/prisma/migrations/20261013160000_split_vpn/migration.sql" 2>/dev/null; then
  vpn_migration_access=$(compose exec -T firewall-db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"SELECT CASE WHEN EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261013160000_split_vpn' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) OR (has_schema_privilege('$camera_migration_role', 'public', 'CREATE') AND has_column_privilege('$camera_migration_role', 'public.' || quote_ident('AppUser'), 'id', 'REFERENCES')) THEN 'ready' ELSE 'missing' END\"" </dev/null) || exit 2
  [ "$vpn_migration_access" = ready ] || { echo "VPN migration needs schema CREATE and AppUser(id) REFERENCES; leaving the running deployment unchanged" >&2; exit 2; }
  [ -c /dev/ppp ] || echo "PPP device is absent; WireGuard remains available. Enable the L2TP Compose override after host setup."
fi
if git cat-file -e "$target_sha:backend/prisma/migrations/20261013170000_vpn_asset_binding/migration.sql" 2>/dev/null; then
  vpn_asset_migration_access=$(compose exec -T firewall-db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"SELECT CASE WHEN EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261013170000_vpn_asset_binding' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) OR (has_schema_privilege('$camera_migration_role', 'public', 'CREATE') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'CameraDevice' AND pg_get_userbyid(c.relowner) <> '$camera_migration_role') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'VpnConnection' AND NOT has_table_privilege('$camera_migration_role', c.oid, 'REFERENCES'))) THEN 'ready' ELSE 'missing' END\"" </dev/null) || exit 2
  [ "$vpn_asset_migration_access" = ready ] || { echo "VPN asset migration needs CameraDevice ownership, schema CREATE and VpnConnection REFERENCES; leaving the running deployment unchanged" >&2; exit 2; }
fi
if git cat-file -e "$target_sha:backend/prisma/migrations/20261017120000_community/migration.sql" 2>/dev/null; then
  community_migration_access=$(compose exec -T firewall-db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"SELECT CASE WHEN EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261017120000_community' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) OR (has_schema_privilege('$camera_migration_role', 'public', 'CREATE') AND has_column_privilege('$camera_migration_role', 'public.' || quote_ident('AppUser'), 'id', 'REFERENCES')) THEN 'ready' ELSE 'missing' END\"" </dev/null) || exit 2
  [ "$community_migration_access" = ready ] || { echo "Community migration needs schema CREATE and AppUser(id) REFERENCES; leaving the running deployment unchanged" >&2; exit 2; }
fi

if git cat-file -e "$target_sha:backend/prisma/migrations/20261018120000_community_collaboration/migration.sql" 2>/dev/null; then
  collaboration_access=$(compose exec -T firewall-db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"SELECT CASE WHEN EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261018120000_community_collaboration' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) OR (has_schema_privilege('$camera_migration_role', 'public', 'CREATE') AND has_column_privilege('$camera_migration_role', 'public.' || quote_ident('AppUser'), 'id', 'REFERENCES') AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'CommunityMessage' AND tableowner = '$camera_migration_role') AND has_table_privilege('$camera_migration_role', 'public.' || quote_ident('CommunityThread'), 'REFERENCES')) THEN 'ready' ELSE 'missing' END\"" </dev/null) || exit 2
  [ "$collaboration_access" = ready ] || { echo "Collaboration migration needs CommunityMessage ownership, schema CREATE and referenced-table access; leaving the running deployment unchanged" >&2; exit 2; }
fi

if git cat-file -e "$target_sha:backend/prisma/migrations/20261018150000_community_storage_retention/migration.sql" 2>/dev/null; then
  retention_access=$(compose exec -T firewall-db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"SELECT CASE WHEN EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261018150000_community_storage_retention' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) OR (has_schema_privilege('$camera_migration_role', 'public', 'CREATE') AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('CommunityThread','CommunityAttachment') AND tableowner <> '$camera_migration_role')) THEN 'ready' ELSE 'missing' END\"" </dev/null) || exit 2
  [ "$retention_access" = ready ] || { echo "Retention migration requires ownership of community tables; deployment unchanged" >&2; exit 2; }
fi
if git cat-file -e "$target_sha:backend/prisma/migrations/20261018160000_camera_company_monitoring/migration.sql" 2>/dev/null; then
  nvr_access=$(compose exec -T firewall-db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"SELECT CASE WHEN EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261018160000_camera_company_monitoring' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) OR (has_column_privilege('$camera_migration_role', 'public.' || quote_ident('Company'), 'id', 'REFERENCES') AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'CameraDevice' AND tableowner <> '$camera_migration_role')) THEN 'ready' ELSE 'missing' END\"" </dev/null) || exit 2
  [ "$nvr_access" = ready ] || { echo "NVR migration requires camera ownership and Company(id) REFERENCES; deployment unchanged" >&2; exit 2; }
fi

git merge --ff-only "$target_sha"

compose config --quiet
compose config --format json | jq -e --arg source "$(pwd -P)/Caddyfile.production.local" '
  .services.gateway.volumes
  | map(select(.target == "/etc/caddy/Caddyfile" and .source == $source))
  | length == 1
' >/dev/null || {
  echo "Gateway is not using the server-local Caddyfile" >&2
  exit 2
}
compose run --rm --no-deps --interactive=false gateway caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile </dev/null

image_for_service() {
  container_id=$(compose ps -q "$1")
  [ -n "$container_id" ] || {
    echo "Production $1 container is missing; refusing to deploy" >&2
    return 1
  }
  docker inspect --format '{{.Image}}' "$container_id"
}

# Record only this project's current application images. Never prune unrelated
# images, running containers, or the database/certificate volumes.
old_web_image=$(image_for_service firewall-web)
old_api_image=$(image_for_service firewall-api)

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

if ! compose exec -T firewall-api node < scripts/deploy/probe-production-gateway.cjs; then
  echo "Deployment health check failed: gateway TLS/API/dashboard is not healthy" >&2
  compose ps
  exit 1
fi

printf '%s\n' "$target_sha" > .deploy/current-main-sha
echo "Production is healthy at main commit $target_sha; cleaning up previous application images"
new_web_image=$(image_for_service firewall-web)
new_api_image=$(image_for_service firewall-api)
sh scripts/deploy/prune-production-images.sh \
  "$old_web_image" "$old_api_image" "$new_web_image" "$new_api_image"
echo "Production cleanup complete; $(df -hP . | awk 'NR == 2 { print $4 }') free"
