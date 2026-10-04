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
  const session = snmp.createV3Session(channel.host || device.host, {
    name: credential.username,
    level: snmp.SecurityLevel.authPriv,
    authProtocol,
    authKey: credential.password,
    privProtocol,
    privKey: credential.passphrase
  }, { port: channel.port ?? 161, retries: 1, timeout: 3500, transport: "udp4" });
  try {
    const values = await new Promise<snmp.Varbind[]>((resolve, reject) => {
      session.get(OIDS, (error, varbinds) => error ? reject(error) : resolve(varbinds));
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
    return { connected: false, errorCode: snmpErrorCode(error), message: snmpErrorCode(error) === "SNMP_TIMEOUT"
      ? "پاسخی از UDP/161 دریافت نشد؛ آدرس، فایروال و دسترسی جمع‌آورنده را بررسی کنید."
      : "درخواست SNMPv3 رد شد؛ نام کاربری، روش SHA/AES و رمزها را بررسی کنید." };
  } finally {
    session.close();
  }
}

export async function recordSnmpSamples(deviceId: string, result: SnmpPollResult) {
  if (!result.connected) return;
  const data = [
    result.uptimeSeconds !== undefined ? { deviceId, metricKey: "system.uptime_seconds", value: result.uptimeSeconds, unit: "seconds", source: "snmpv3" } : null,
    result.interfaceCount !== undefined ? { deviceId, metricKey: "interfaces.count", value: result.interfaceCount, unit: "count", source: "snmpv3" } : null
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  if (data.length) await prisma.metricSample.createMany({ data });
}
