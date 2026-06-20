import type { FastifyServerOptions } from "fastify";
import { isProduction } from "../config/env.js";

export const loggerConfig: FastifyServerOptions["logger"] = {
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie"],
    remove: true
  }
};
