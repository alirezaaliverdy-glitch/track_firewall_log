-- Add the vendor-appropriate second channel for devices that predate dual-channel onboarding.
INSERT INTO "DeviceConnectionChannel" (
  "id", "deviceId", "role", "method", "purposes", "host", "port", "credentialId",
  "enabled", "priority", "status", "settingsJson", "createdAt", "updatedAt"
)
SELECT
  'dcc_' || md5(d."id" || ':observability'),
  d."id",
  'observability',
  CASE
    WHEN lower(d."vendor") LIKE '%linux%' THEN 'agent'
    WHEN lower(d."vendor") LIKE '%cisco%' THEN 'restconf'
    WHEN lower(d."vendor") LIKE '%mikrotik%' AND d."protocol"::text = 'api' THEN 'ssh'
    WHEN lower(d."vendor") LIKE '%mikrotik%' THEN 'rest_api'
    WHEN lower(d."vendor") LIKE '%forti%' THEN 'syslog'
    WHEN lower(d."vendor") LIKE '%sophos%' THEN 'syslog'
    ELSE 'syslog'
  END,
  CASE
    WHEN lower(d."vendor") LIKE '%mikrotik%' THEN ARRAY['inventory']::TEXT[]
    WHEN lower(d."vendor") LIKE '%cisco%' THEN ARRAY['control','inventory']::TEXT[]
    WHEN lower(d."vendor") LIKE '%linux%' THEN ARRAY['telemetry','events']::TEXT[]
    ELSE ARRAY['events']::TEXT[]
  END,
  CASE WHEN lower(d."vendor") LIKE '%forti%' OR lower(d."vendor") LIKE '%sophos%' THEN NULL ELSE d."host" END,
  CASE
    WHEN lower(d."vendor") LIKE '%linux%' THEN NULL
    WHEN lower(d."vendor") LIKE '%cisco%' THEN 443
    WHEN lower(d."vendor") LIKE '%mikrotik%' AND d."protocol"::text = 'api' THEN 22
    WHEN lower(d."vendor") LIKE '%mikrotik%' THEN 443
    ELSE 6514
  END,
  CASE WHEN lower(d."vendor") LIKE '%mikrotik%' THEN d."credentialId" ELSE NULL END,
  lower(d."vendor") LIKE '%mikrotik%',
  2,
  CASE WHEN lower(d."vendor") LIKE '%mikrotik%' THEN 'available' ELSE 'setup_required' END,
  CASE WHEN lower(d."vendor") LIKE '%mikrotik%'
    THEN '{"readiness":"ready","backfilled":true}'::jsonb
    ELSE '{"readiness":"setup_required","backfilled":true}'::jsonb
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Device" d
ON CONFLICT ("deviceId", "role") DO NOTHING;
