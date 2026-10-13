import type { CameraActionPlan, CameraDevice } from "@prisma/client";
import { createHash } from "node:crypto";
import { CameraError } from "./camera-network.js";

export const CAMERA_CONTROL_TEMPLATES = {
  goto_preset: { labelFa: "رفتن به موقعیت ذخیره‌شده", labelEn: "Go to preset", template: "onvif.ptz.goto_preset", handler: "GotoPreset", risk: "medium" },
  reboot: { labelFa: "راه‌اندازی مجدد", labelEn: "Restart device", template: "onvif.device.reboot", handler: "SystemReboot", risk: "high" }
} as const;

export type CameraOperation = keyof typeof CAMERA_CONTROL_TEMPLATES;
export function cameraOperation(value: unknown): CameraOperation {
  if (typeof value !== "string" || !Object.hasOwn(CAMERA_CONTROL_TEMPLATES, value)) throw new CameraError("CAMERA_OPERATION_UNSUPPORTED", 422);
  return value as CameraOperation;
}
export function cameraRevision(camera: Pick<CameraDevice, "host" | "onvifPort" | "onvifPath" | "connectionEncrypted"> & { onvifHttps?: boolean }) {
  return createHash("sha256").update(JSON.stringify([camera.host, camera.onvifPort, camera.onvifPath, camera.onvifHttps === true, camera.connectionEncrypted])).digest("hex");
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
  if (camera.connectionMode !== "onvif" || camera.status !== "verified") throw new CameraError("CAMERA_ONVIF_UNAVAILABLE", 422);
  return { allowed: true, template: CAMERA_CONTROL_TEMPLATES[operation].template, operation };
}
