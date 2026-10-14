// Match docker-entrypoint.sh without loading or disclosing any runtime secret.
const configuredUrl = process.env.DATABASE_URL;
let role = process.env.POSTGRES_USER || "firewall_app";
if (configuredUrl) {
  try {
    role = decodeURIComponent(new URL(configuredUrl).username);
  } catch {
    process.stderr.write("Invalid database configuration for migration preflight\n");
    process.exit(2);
  }
}
if (!/^[a-zA-Z0-9_]+$/.test(role)) {
  process.stderr.write("Unsupported database role for migration preflight\n");
  process.exit(2);
}
process.stdout.write(role);
