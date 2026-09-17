import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { resolveDatabaseUrl } from "./src/config/database-url.js";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: resolveDatabaseUrl(env("DATABASE_URL"))
  }
});
