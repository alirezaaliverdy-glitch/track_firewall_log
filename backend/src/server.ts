import { env } from "./config/env.js";
import { shutdownDatabase } from "./db/prisma.js";
import { buildApp } from "./app.js";

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

async function shutdown(signal: NodeJS.Signals) {
  try {
    app?.log.info({ signal }, "Shutting down");
    await app?.close();
    await shutdownDatabase();
    process.exit(0);
  } catch (error) {
    app?.log.error({ err: error }, "Shutdown failed");
    process.exit(1);
  }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
  app = await buildApp();
  await app.listen({ port: env.port, host: "0.0.0.0" });
} catch (error) {
  const message = error instanceof Error ? error.message : "Backend startup failed.";
  console.error(message);
  await shutdownDatabase().catch(() => undefined);
  process.exit(1);
}
