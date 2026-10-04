import * as snmp from "net-snmp";
import type { Device, DeviceConnectionChannel } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { resolveCredentialById } from "./credential.service.js";

const OIDS = ["1.3.6.1.2.1.1.5.0", "1.3.6.1.2.1.1.3.0", "1.3.6.1.2.1.2.1.0"];

export type SnmpPollResult = {
  connected: boolean;
  message: string;
  errorCode?: string;
  systemName?: string;
  uptimeSeconds?: number;
  interfaceCount?: number;
};

export function snmpErrorCode(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  if (/timeout/i.test(value)) return "SNMP_TIMEOUT";
  if (/auth|wrong digest|unknown user|decryption|privacy|unsupported security/i.test(value)) return "SNMP_AUTH_FAILED";
  return "SNMP_QUERY_FAILED";
}

export async function pollSnmpv3(device: Device, channel: DeviceConnectionChannel): Promise<SnmpPollResult> {
  if (channel.method !== "snmpv3") return { connected: false, errorCode: "SNMP_NOT_CONFIGURED", message: "این مسیر برای SNMPv3 تنظیم نشده است." };
  const credential = channel.credentialId ? await resolveCredentialById(channel.credentialId) : null;
  if (!credential?.username || !credential.password || !credential.passphrase) {
    return { connected: false, errorCode: "SNMP_CREDENTIAL_REQUIRED", message: "نام کاربری، رمز احراز هویت و رمز محرمانگی SNMPv3 را ثبت کنید." };
  }
  const settings = channel.settingsJson && typeof channel.settingsJson === "object" && !Array.isArray(channel.settingsJson)
    ? channel.settingsJson as Record<string, unknown> : {};
  const authProtocol = settings.authProtocol === "SHA256" ? snmp.AuthProtocols.sha256 : snmp.AuthProtocols.sha;
  const privProtocol = snmp.PrivProtocols.aes;
  let session: snmp.Session | undefined;
  try {
    session = snmp.createV3Session(device.host, {
      name: credential.username,
      level: snmp.SecurityLevel.authPriv,
      authProtocol,
      authKey: credential.password,
      privProtocol,
      privKey: credential.passphrase
    }, { port: channel.port ?? 161, retries: 1, timeout: 3500, transport: "udp4" });
    const activeSession = session;
    const values = await new Promise<snmp.Varbind[]>((resolve, reject) => {
      activeSession.get(OIDS, (error, varbinds) => {
        if (error) reject(error);
        else if (varbinds && varbinds.length >= 2) resolve(varbinds);
        else reject(new Error("empty SNMP response"));
      });
    });
    if (snmp.isVarbindError(values[0]) || snmp.isVarbindError(values[1])) {
      return { connected: false, errorCode: "SNMP_OID_UNAVAILABLE", message: "پاسخ SNMP رسید، ولی شناسه یا زمان‌کار دستگاه در دسترس نیست؛ سطح دسترسی کاربر را بررسی کنید." };
    }
    const uptimeTicks = Number(values[1].value);
    const interfaceCount = values[2] && !snmp.isVarbindError(values[2]) ? Number(values[2].value) : undefined;
    return {
      connected: true,
      message: "داده‌های SNMPv3 از دستگاه دریافت شد.",
      systemName: String(values[0].value),
      uptimeSeconds: Number.isFinite(uptimeTicks) ? uptimeTicks / 100 : undefined,
      interfaceCount: interfaceCount !== undefined && Number.isFinite(interfaceCount) ? interfaceCount : undefined
    };
  } catch (error) {
    const errorCode = snmpErrorCode(error);
    return { connected: false, errorCode, message: errorCode === "SNMP_TIMEOUT"
      ? "پاسخی از SNMP دریافت نشد؛ آدرس، پورت UDP و فایروال را بررسی کنید."
      : errorCode === "SNMP_AUTH_FAILED" ? "درخواست SNMPv3 رد شد؛ نام کاربری، روش SHA/AES و رمزها را بررسی کنید."
        : "پاسخ SNMPv3 قابل‌خواندن نبود؛ مجوز OIDهای پایه و نسخه SNMP دستگاه را بررسی کنید." };
  } finally {
    session?.close();
  }
}

export async function recordSnmpSamples(deviceId: string, result: SnmpPollResult) {
  if (!result.connected) return;
  const data = [
    result.uptimeSeconds !== undefined ? { deviceId, metricKey: "system.uptime_seconds", value: result.uptimeSeconds, unit: "seconds", source: "snmpv3" } : null,
    result.interfaceCount !== undefined ? { deviceId, metricKey: "interfaces.count", value: result.interfaceCount, unit: "count", source: "snmpv3" } : null
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  if (data.length) {
    try { await prisma.metricSample.createMany({ data }); }
    catch { /* Optional metric storage must not invalidate a verified protocol response. */ }
  }
}
