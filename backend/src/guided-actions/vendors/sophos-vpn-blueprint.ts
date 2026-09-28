import type { GuidedActionBlueprint, GuidedActionField } from "../types.js";
import { createEphemeralSecretRef } from "../../services/ephemeral-secret.service.js";
import { normalizeSophosVpn, SOPHOS_VPN_SECRET_PURPOSE } from "../../connectors/sophos-vpn.js";

const field = (key: string, labelFa: string, type: GuidedActionField["type"], extra: Partial<GuidedActionField> = {}): GuidedActionField => ({ key, labelFa, type, required: true, ...extra, validation: { ...extra.validation, allowExampleValue: true } });
export const sophosVpnBlueprint: GuidedActionBlueprint = {
  id: "sophos_ipsec_site_to_site", vendor: "sophos", titleFa: "ساخت تونل IPsec سوفوس", category: "vpn", risk: "high", actionKind: "guided_action",
  descriptionFa: "اتصال امن دو شبکه با پروفایل IKEv2 موجود؛ ساخت تنظیمات با پیش‌نمایش و تأیید شما. تنظیم سمت مقابل نیز لازم است.",
  implementationState: "implemented", researchStatus: "verified_from_official_docs", supportedConnectors: ["sophos-api"], requiredCapabilities: ["canExecuteWriteActions"],
  prerequisites: [{ id: "api", titleFa: "API فعال، حساب مجاز و HTTPS معتبر", required: true }, { id: "backup", titleFa: "بک‌آپ تنظیمات و دسترسی مدیریتی جایگزین", required: true }],
  steps: [
    { id: "networks", titleFa: "۱. نام و شبکه‌های دو طرف", descriptionFa: "دو IP Host از نوع Network و IPv4 انتخاب کنید. اگر فهرست خالی است، در Hosts and services دستگاه شبکه‌ها را بسازید و جمع‌آوری را تازه کنید.", fields: [
      field("vpnName", "نام تونل", "text", { placeholderFa: "Branch_IPsec", validation: { pattern: "^[A-Za-z][A-Za-z0-9_]{0,99}$" } }),
      field("localHost", "شبکه داخلی شما", "addressObjectSelect", { dynamicOptions: { provider: "sophos_networks" } }),
      field("remoteHost", "شبکه داخلی سمت مقابل", "addressObjectSelect", { dynamicOptions: { provider: "sophos_networks" } }),
    ] },
    { id: "peer", titleFa: "۲. پورت و طرف مقابل", descriptionFa: "این مرحله برای دو دروازه ثابت IPv4 است. شناسه‌های IKE باید با تنظیم سمت مقابل تطبیق داشته باشند.", fields: [
      field("wanInterface", "پورت WAN", "interfaceSelect", { dynamicOptions: { provider: "sophos_wan_interfaces" } }),
      field("remoteGateway", "IPv4 عمومی دروازه سمت مقابل", "ip", { placeholderFa: "198.51.100.20" }),
      field("localId", "شناسه IKE محلی (IPv4)", "ip", { helpFa: "معمولاً IP عمومی دروازه شما؛ در سمت مقابل به‌عنوان Remote ID تنظیم شود." }),
      field("remoteId", "شناسه IKE سمت مقابل (IPv4)", "ip", { helpFa: "در سمت مقابل به‌عنوان Local ID تنظیم شده باشد." }),
    ] },
    { id: "security", titleFa: "۳. امنیت و کلید مشترک", descriptionFa: "در Profiles > IPsec profiles یک پروفایل IKEv2 با AES، SHA2 و DH14 یا قوی‌تر آماده کنید. برنامه الگوریتم‌های قابل خواندن را بررسی می‌کند؛ نسخه IKE در برخی APIها قابل خواندن نیست و باید در پنل تأیید شود.", fields: [
      field("profileName", "پروفایل IPsec موجود", "serviceObjectSelect", { dynamicOptions: { provider: "sophos_vpn_profiles" } }),
      field("profileIkev2Confirmed", "پروفایل انتخاب‌شده را در دستگاه بررسی کرده‌ام و IKEv2 است", "checkbox"),
      field("psk", "کلید مشترک دو طرف (PSK)", "password", { secret: true, helpFa: "۱۶ تا ۶۴ نویسه؛ همین کلید را در سمت مقابل وارد کنید. در تاریخچه ذخیره نمی‌شود.", validation: { pattern: "^[^\\r\\n]{16,64}$" } }),
    ] },
    { id: "activation", titleFa: "۴. فعال‌سازی و عبور ترافیک", descriptionFa: "این عملیات فقط اتصال IPsec را می‌سازد. قوانین LAN ↔ VPN با سرویس‌ها و شبکه‌های مورد نیاز باید در دستگاه موجود باشند؛ قانون دسترسی عمومی خودکار اضافه نمی‌شود.", fields: [
      field("startupMode", "رفتار پس از راه‌اندازی VPN", "select", { options: [{ value: "RespondOnly", labelFa: "پاسخ به سمت مقابل" }, { value: "Initiate", labelFa: "شروع مذاکره از این دستگاه" }, { value: "Disable", labelFa: "بدون شروع خودکار" }], validation: { allowedValues: ["RespondOnly", "Initiate", "Disable"] } }),
      field("enableAfterCreate", "تنظیمات اتصال پس از ساخت فعال شود", "checkbox", { required: false, helpFa: "فعال بودن تنظیمات، برقراری تونل را تضمین نمی‌کند؛ SA و عبور ترافیک جدا بررسی می‌شوند." }),
    ] },
  ],
  buildActionPlan(context) {
    const rawSecret = String(context.values.psk ?? "");
    if (rawSecret !== rawSecret.trim() || rawSecret.length < 16 || rawSecret.length > 64 || /[\r\n`|;]/.test(rawSecret)) return { ok: false, status: "needs_input", reasonFa: "PSK باید ۱۶ تا ۶۴ نویسه، بدون فاصله ابتدا و انتها، خط جدید، backtick، | و ; باشد." };
    try {
      const normalized = normalizeSophosVpn({ ...context.values, pskSecretRef: "tmpsec_00000000-0000-0000-0000-000000000000" });
      normalized.pskSecretRef = createEphemeralSecretRef(rawSecret, SOPHOS_VPN_SECRET_PURPOSE);
      const preview = { summaryFa: "ساخت اتصال Site-to-Site؛ تنظیمات پس از اجرا از دستگاه دوباره خوانده می‌شوند.", fieldsFa: { "تونل": normalized.vpnName, "شبکه محلی": normalized.localHost, "شبکه سمت مقابل": normalized.remoteHost, "WAN": normalized.wanInterface, "دروازه سمت مقابل": normalized.remoteGateway, "پروفایل IKEv2": normalized.profileName, "کلید مشترک": "مخفی؛ اعتبار موقت ۳۰ دقیقه", "فعال‌سازی": normalized.enableAfterCreate ? "فعال" : "غیرفعال", "وضعیت واقعی SA": "هنوز بررسی نشده" } };
      return { ok: true, preview, actionPlanInput: { source: "user", deviceId: context.deviceId, vendor: "sophos", actionType: "generic_security_action", riskLevel: "high", requestedBy: context.requestedBy, parametersJson: { ...normalized, vendor: "sophos", structuredPreview: preview, metadata: { source: "guided_action_wizard", blueprintId: context.blueprintId, catalogCommandId: "sophos.create-ipsec-tunnel", executionTemplateRef: "sophos_create_ipsec_tunnel", connectorType: "sophos-api", implementationState: "implemented", executable: true, operationCategory: "vpn", normalizedParams: normalized, requiredParamsSatisfied: true } } } };
    } catch (error) { return { ok: false, status: "needs_input", reasonFa: error instanceof Error ? error.message : "پارامترهای تونل معتبر نیستند." }; }
  },
  verification: { commands: ["Get VPNIPSecConnection; compare configuration (not SA)"] },
  rollback: { automatic: false, available: false, template: "manual_review_new_tunnel" },
};
