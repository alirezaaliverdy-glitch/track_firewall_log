import type { FastifyServerOptions } from "fastify";
import { isProduction } from "../config/env.js";
import { sensitiveLogPaths } from "../security/redaction.js";

export const loggerConfig: FastifyServerOptions["logger"] = {
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  redact: {
    paths: sensitiveLogPaths,
    censor: "[REDACTED]"
  }
};
