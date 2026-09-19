import { env, isProduction } from "../config/env.js";

console.info(JSON.stringify({
  ok: true,
  nodeEnv: env.nodeEnv,
  appProfile: env.appProfile,
  productionProfile: isProduction,
  databaseConfigured: Boolean(env.databaseUrl),
  corsOriginCount: env.corsOrigins.length,
  actionRequireManagementSource: env.actionRequireManagementSource,
  labUnrestrictedManagementEnabled: env.actionAllowLabUnrestrictedManagement
}));
