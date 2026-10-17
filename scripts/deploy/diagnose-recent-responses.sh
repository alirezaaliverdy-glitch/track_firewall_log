#!/bin/sh
# Read-only, sanitized execution metadata. Never select device logs, parameters,
# command text, user names, credentials or raw connector output.
set -eu
cd /home/alireza/track_firewall_log
docker compose --project-name firewall-soar -f docker-compose.yml -f docker-compose.override.yml exec -T firewall-db sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1' <<'SQL'
SELECT json_build_object(
  'actionType', "actionType", 'status', status,
  'findingLinked', COALESCE("parametersJson" ? 'findingId', false),
  'resultShape', jsonb_typeof("resultJson"),
  'connectorInvoked', "resultJson"->'connectorInvoked',
  'executed', "resultJson"->'executed',
  'commandCount', CASE WHEN jsonb_typeof("resultJson"->'commands') = 'array' THEN jsonb_array_length("resultJson"->'commands') ELSE 0 END,
  'safeErrorCode', CASE WHEN "resultJson"->>'error' ~ '^[A-Z0-9_]{1,80}$' THEN "resultJson"->>'error' ELSE NULL END,
  'minutesAgo', ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "createdAt"))/60)
)
FROM "ActionPlan" WHERE "createdAt" > CURRENT_TIMESTAMP - INTERVAL '3 days'
ORDER BY "createdAt" DESC LIMIT 12;
SELECT json_build_object('event', "eventType",
  'code', CASE WHEN "metadataJson"->>'code' ~ '^[A-Z0-9_]{1,80}$' THEN "metadataJson"->>'code' ELSE NULL END,
  'errorCode', CASE WHEN "metadataJson"->>'error' ~ '^[A-Z0-9_]{1,80}$' THEN "metadataJson"->>'error' ELSE NULL END,
  'reasonCodes', "metadataJson"->'reasonCodes')
FROM "ActionAuditLog" WHERE "actionPlanId" = (SELECT id FROM "ActionPlan" ORDER BY "createdAt" DESC LIMIT 1)
ORDER BY "createdAt" DESC LIMIT 20;
SQL
