import type { CameraActionPlan, CameraDevice } from "@prisma/client";
import { createHash } from "node:crypto";
import { CameraError } from "./camera-network.js";

export const CAMERA_CONTROL_TEMPLATES = {
  nvr_channel_enable: { labelFa: "قطع و وصل کانال تصویر NVR", labelEn: "Enable or disable NVR channel", template: "appweb.nvr.channel_enabled", handler: "VerifiedDecoderChannelConfig", risk: "high" },
  nvr_overwrite: { labelFa: "تغییر رفتار هاردِ پر", labelEn: "Change disk-full behavior", template: "appweb.nvr.overwrite", handler: "VerifiedGeneralConfig", risk: "high" },
  nvr_recording_mode: { labelFa: "تغییر حالت ضبط کانال", labelEn: "Change channel recording mode", template: "appweb.nvr.recording_mode", handler: "VerifiedChannelConfig", risk: "high" },
  ptz_step: { labelFa: "حرکت کوتاه دوربین", labelEn: "Short PTZ step", template: "onvif.ptz.relative_step", handler: "RelativeMove", risk: "medium" },
  ptz_stop: { labelFa: "توقف حرکت دوربین", labelEn: "Stop PTZ", template: "onvif.ptz.stop", handler: "Stop", risk: "medium" },
  goto_preset: { labelFa: "رفتن به موقعیت ذخیره‌شده", labelEn: "Go to preset", template: "onvif.ptz.goto_preset", handler: "GotoPreset", risk: "medium" },
  reboot: { labelFa: "راه‌اندازی مجدد", labelEn: "Restart device", template: "onvif.device.reboot", handler: "SystemReboot", risk: "high" }
} as const;

export type CameraOperation = keyof typeof CAMERA_CONTROL_TEMPLATES;
export function cameraOperation(value: unknown): CameraOperation {
  if (typeof value !== "string" || !Object.hasOwn(CAMERA_CONTROL_TEMPLATES, value)) throw new CameraError("CAMERA_OPERATION_UNSUPPORTED", 422);
  return value as CameraOperation;
}
export function cameraRevision(camera: Pick<CameraDevice, "host" | "onvifPort" | "onvifPath" | "connectionEncrypted"> & { connectionMode?: string; onvifHttps?: boolean; companyId?: string | null; vpnConnectionId?: string | null }) {
  return createHash("sha256").update(JSON.stringify([camera.host, camera.onvifPort, camera.onvifPath, camera.onvifHttps === true, camera.connectionEncrypted, camera.companyId ?? null, camera.vpnConnectionId ?? null, camera.connectionMode ?? "onvif"])).digest("hex");
}

/** Camera PolicyGuard: one explicit confirmation executes one registered ONVIF template. */
export function evaluateCameraPolicy(input: { plan: CameraActionPlan; camera: CameraDevice; ownerId: string; role: string; intent: unknown; confirmed: unknown }) {
  const { plan, camera } = input;
  const operation = cameraOperation(plan.operation);
  if (plan.ownerId !== input.ownerId || camera.ownerId !== input.ownerId || plan.cameraId !== camera.id) throw new CameraError("CAMERA_NOT_FOUND", 404);
  if (input.role === "viewer" || (operation === "reboot" && input.role !== "admin")) throw new CameraError("CAMERA_CONTROL_FORBIDDEN", 403);
  if (input.intent !== "execute" || input.confirmed !== true) throw new CameraError("CAMERA_CONFIRM_REQUIRED");
  if (plan.status !== "preview_ready") throw new CameraError("CAMERA_PLAN_ALREADY_USED", 409);
  if (plan.expiresAt.getTime() < Date.now() || plan.cameraRevision !== cameraRevision(camera)) throw new CameraError("CAMERA_PREVIEW_EXPIRED", 409);
  if (operation.startsWith("nvr_")) {
    if (camera.kind !== "nvr" || camera.connectionMode !== "appweb" || camera.status !== "verified") throw new CameraError("NVR_CONFIG_OPERATION_UNSUPPORTED", 422);
  } else if (camera.connectionMode !== "onvif" || camera.status !== "verified") throw new CameraError("CAMERA_ONVIF_UNAVAILABLE", 422);
  return { allowed: true, template: CAMERA_CONTROL_TEMPLATES[operation].template, operation };
}
