import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db/prisma.js";
import { getVendorDailyCheckProfile, VENDOR_DAILY_CHECK_PROFILES } from "../daily-check/vendor-daily-check-profiles.js";

export const dailyCheckRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/daily-check/profiles", async () => ({ profiles: Object.values(VENDOR_DAILY_CHECK_PROFILES) }));
  app.get<{ Params: { deviceId: string } }>("/api/daily-check/devices/:deviceId/profile", async (request, reply) => {
    const device = await prisma.device.findUnique({ where: { id: request.params.deviceId } });
    if (!device) return reply.code(404).send({ error: "DEVICE_NOT_FOUND", messageFa: "دستگاه پیدا نشد." });
    const profile = getVendorDailyCheckProfile(device.vendor, device.type);
    if (!profile) return reply.code(422).send({ error: "VENDOR_NOT_SUPPORTED", messageFa: "برای این وندور پروفایل چک روزانه تعریف نشده است." });
    return { deviceId: device.id, detectedVendor: profile.vendor, profile };
  });
};
