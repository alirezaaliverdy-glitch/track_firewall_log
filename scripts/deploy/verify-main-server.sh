#!/usr/bin/env sh
# Read-only release acceptance. Run from the production checkout after deployment.
set -eu
expected_sha=${1:?Expected deployed commit is required}
case "$expected_sha" in *[!0-9a-f]*|'') exit 2 ;; esac
[ "${#expected_sha}" -eq 40 ] || exit 2
compose() { docker compose --project-name firewall-soar -f docker-compose.yml -f docker-compose.override.yml "$@"; }
[ "$(git rev-parse HEAD)" = "$expected_sha" ]
[ "$(cat .deploy/current-main-sha)" = "$expected_sha" ]
git diff --quiet && git diff --cached --quiet
printf 'checkout_and_deploy_marker=%s\n' "$expected_sha"
for service in firewall-api firewall-web firewall-db gateway firewall-vpn; do
  container=$(compose ps -q "$service")
  [ -n "$container" ]
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")
  [ "$health" = healthy ]
  printf '%s=%s\n' "$service" "$health"
done
migrations=$(compose exec -T firewall-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public._prisma_migrations WHERE migration_name IN ('"'"'20261012150000_camera_workspace'"'"', '"'"'20261013160000_split_vpn'"'"', '"'"'20261013170000_vpn_asset_binding'"'"') AND finished_at IS NOT NULL AND rolled_back_at IS NULL"')
[ "$migrations" = 3 ]
printf 'camera_and_vpn_migrations=3_applied\n'
community_migrations=$(compose exec -T firewall-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public._prisma_migrations WHERE migration_name = '"'"'20261017120000_community'"'"' AND finished_at IS NOT NULL AND rolled_back_at IS NULL"')
[ "$community_migrations" = 1 ]
printf 'community_migration=applied\n'
collaboration_migrations=$(compose exec -T firewall-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public._prisma_migrations WHERE migration_name = '\''20261018120000_community_collaboration'\'' AND finished_at IS NOT NULL AND rolled_back_at IS NULL"')
[ "$collaboration_migrations" = 1 ]
printf 'community_collaboration_migration=applied\n'
storage_nvr_migrations=$(compose exec -T firewall-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public._prisma_migrations WHERE migration_name IN ('\''20261018150000_community_storage_retention'\'', '\''20261018160000_camera_company_monitoring'\'') AND finished_at IS NOT NULL AND rolled_back_at IS NULL"')
[ "$storage_nvr_migrations" = 2 ]
printf 'storage_and_nvr_migrations=applied\n'
compose exec -T firewall-api node < scripts/deploy/probe-production-gateway.cjs
