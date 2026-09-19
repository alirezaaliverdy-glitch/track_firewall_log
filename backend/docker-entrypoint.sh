#!/bin/sh
set -eu

read_secret() {
  secret_file="$1"
  secret_name="$2"
  if [ ! -r "$secret_file" ]; then
    echo "Required runtime secret is unavailable: $secret_name" >&2
    exit 1
  fi
  tr -d '\r\n' < "$secret_file"
}

if [ -z "${DATABASE_URL:-}" ]; then
  database_password="$(read_secret "${DATABASE_SECRET_FILE:-/run/firewall-secrets/postgres_password}" "database password")"
  encoded_password="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$database_password")"
  export DATABASE_URL="postgresql://${POSTGRES_USER:-firewall_app}:$encoded_password@firewall-db:5432/${POSTGRES_DB:-firewall_log_analyzer}"
fi

if [ -z "${AUTH_SESSION_SECRET:-}" ]; then
  export AUTH_SESSION_SECRET="$(read_secret "${AUTH_SESSION_SECRET_FILE:-/run/firewall-secrets/auth_session_secret}" "authentication session secret")"
fi

if [ -z "${CREDENTIAL_ENCRYPTION_KEY:-}" ]; then
  export CREDENTIAL_ENCRYPTION_KEY="$(read_secret "${CREDENTIAL_ENCRYPTION_KEY_FILE:-/run/firewall-secrets/credential_encryption_key}" "credential encryption key")"
fi

./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
./node_modules/.bin/prisma db seed --schema prisma/schema.prisma

echo "Firewall SOAR API is starting. Initial administrator credentials are stored in ${BOOTSTRAP_ADMIN_CREDENTIALS_FILE:-/app/storage/bootstrap/initial-admin.json}."
exec node dist/server.js
