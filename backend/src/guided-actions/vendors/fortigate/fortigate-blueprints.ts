import type { GuidedActionBlueprint, GuidedActionBuildContext, GuidedActionField } from "../../types.js";
import {
  FORTIGATE_ADDRESS_TYPE_OPTIONS,
  FORTIGATE_ALLOWACCESS_OPTIONS,
  FORTIGATE_ENABLE_DISABLE_OPTIONS,
  FORTIGATE_LOG_TRAFFIC_OPTIONS,
  FORTIGATE_POLICY_ACTION_OPTIONS,
  FORTIGATE_PSK_MODE_OPTIONS,
  FORTIGATE_SERVICE_PROTOCOL_OPTIONS,
  FORTIGATE_VPN_SCENARIO_OPTIONS,
} from "./fortigate-options.js";

const nameValidation = { pattern: "^[A-Za-z0-9_.:-]{1,79}$" };
const portValidation = { min: 1, max: 65535 };

function field(key: string, labelFa: string, type: GuidedActionField["type"], required = true, extra: Partial<GuidedActionField> = {}): GuidedActionField {
  return { key, labelFa, type, required, ...extra };
}

function missing(context: GuidedActionBuildContext, fields: GuidedActionField[]) {
  return fields.filter((item) => item.required && (context.values[item.key] === undefined || context.values[item.key] === ""));
}

function actionPlan(context: GuidedActionBuildContext, actionType: string, riskLevel: "low" | "medium" | "high" | "critical", params: Record<string, unknown>) {
  return {
    source: "ai" as const,
    deviceId: context.deviceId,
    vendor: "fortigate" as const,
    actionType,
    riskLevel,
    requestedBy: context.requestedBy,
    parametersJson: {
      ...params,
      source: "guided_action",
      implementationState: "implemented",
      executionSupport: "connector",
      connectorType: "fortigate-ssh",
      executionTemplateRef: actionType,
      requiredParamsSatisfied: true,
      metadata: {
        source: "guided_action",
        blueprintId: context.blueprintId,
        initialRequest: context.initialRequest,
        vendor: "fortigate",
        actionType,
        executionSupport: "connector",
        implementationState: "implemented",
        connectorType: "fortigate-ssh",
        executionTemplateRef: actionType,
        requiredParamsSatisfied: true,
        previewGenerated: false,
        executed: false,
        connectorInvoked: false,
        lastExecutionStatus: "not_started",
        guidedSteps: [],
      },
    },
  };
}

const firewallPolicyFields = [
  field("name", "نام Policy", "text", false, { placeholderFa: "managed-lan-to-internet", validation: nameValidation }),
  field("srcintf", "اینترفیس مبدا", "interfaceSelect", true, { placeholderFa: "lan یا port1", dynamicOptions: { provider: "fortigate_interfaces" }, validation: { pattern: nameValidation.pattern, allowCustom: true }, helpFa: "اگر لیست از دستگاه خوانده نشد، نام را دستی وارد کن و قبل از اجرا بررسی می‌شود." }),
  field("dstintf", "اینترفیس مقصد", "interfaceSelect", true, { placeholderFa: "wan1 یا port2", dynamicOptions: { provider: "fortigate_interfaces" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
  field("sourceCidr", "شبکه مبدا خام", "cidr", false, { placeholderFa: "192.168.7.0/24", helpFa: "اگر Address Object انتخاب نشود، کامپایلر یک آبجکت مدیریت‌شده می‌سازد." }),
  field("srcaddr", "Address Object مبدا", "addressObjectSelect", false, { placeholderFa: "all یا نام آبجکت", dynamicOptions: { provider: "fortigate_address_objects" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
  field("dstaddr", "Address Object مقصد", "addressObjectSelect", true, { placeholderFa: "all یا Internet", dynamicOptions: { provider: "fortigate_address_objects" }, validation: { pattern: "^[A-Za-z0-9_.:-]{1,79}$|^all$|^ALL$", allowCustom: true } }),
  field("services", "سرویس‌ها", "serviceObjectSelect", true, { placeholderFa: "ALL یا HTTPS", dynamicOptions: { provider: "fortigate_service_objects" }, validation: { allowCustom: true } }),
  field("schedule", "زمان‌بندی", "text", false, { placeholderFa: "always", validation: nameValidation }),
  field("action", "عملکرد Policy", "select", true, { options: FORTIGATE_POLICY_ACTION_OPTIONS, validation: { allowedValues: FORTIGATE_POLICY_ACTION_OPTIONS.map((item) => item.value) } }),
  field("nat", "NAT", "checkbox", true, { helpFa: "برای دسترسی اینترنت معمولا فعال است." }),
  field("logTraffic", "لاگ ترافیک", "select", true, { options: FORTIGATE_LOG_TRAFFIC_OPTIONS, validation: { allowedValues: FORTIGATE_LOG_TRAFFIC_OPTIONS.map((item) => item.value) } }),
  field("disabled", "ایجاد به صورت غیرفعال", "checkbox", true, { helpFa: "Policy جدید به صورت پیش‌فرض غیرفعال ساخته می‌شود." }),
];

function buildPolicy(context: GuidedActionBuildContext) {
  const required = firewallPolicyFields.filter((item) => ["srcintf", "dstintf", "dstaddr", "services", "action", "nat", "logTraffic", "disabled"].includes(item.key));
  const missingFields = missing(context, required);
  if (missingFields.length) return { ok: false as const, status: "needs_input" as const, reasonFa: "برای ساخت Policy چند مقدار لازم است.", missingFields };
  const services = Array.isArray(context.values.services) ? context.values.services : String(context.values.services).split(",").map((item) => item.trim()).filter(Boolean);
  const srcaddr = context.values.srcaddr ? [String(context.values.srcaddr)] : undefined;
  return {
    ok: true as const,
    actionPlanInput: actionPlan(context, "fortigate_create_policy", "medium", {
      name: context.values.name,
      srcintf: context.values.srcintf,
      dstintf: context.values.dstintf,
      sourceCidr: context.values.sourceCidr,
      srcaddr,
      dstaddr: [String(context.values.dstaddr)],
      services,
      schedule: context.values.schedule || "always",
      action: context.values.action || "accept",
      nat: context.values.nat === true,
      logTraffic: context.values.logTraffic !== "disable",
      disabled: context.values.disabled !== false,
    }),
    preview: { summaryFa: "Policy جدید بعد از تایید در FortiGate ساخته می‌شود و پیش‌فرض غیرفعال است." },
  };
}

const addressFields = [
  field("name", "نام Address Object", "text", true, { validation: nameValidation }),
  field("type", "نوع آدرس", "select", true, { options: FORTIGATE_ADDRESS_TYPE_OPTIONS, validation: { allowedValues: FORTIGATE_ADDRESS_TYPE_OPTIONS.map((item) => item.value) } }),
  field("cidr", "Subnet / CIDR", "cidr", true, { placeholderFa: "10.10.10.0/24", dependsOn: { type: "subnet" } }),
  field("startIp", "IP شروع", "ip", true, { dependsOn: { type: "iprange" } }),
  field("endIp", "IP پایان", "ip", true, { dependsOn: { type: "iprange" } }),
  field("fqdn", "FQDN", "text", true, { placeholderFa: "app.example.com", dependsOn: { type: "fqdn" } }),
  field("geo", "کد کشور", "text", true, { placeholderFa: "IR", dependsOn: { type: "geography" }, validation: { pattern: "^[A-Z]{2}$" } }),
  field("comment", "توضیح", "textarea", false),
];

function buildAddress(context: GuidedActionBuildContext) {
  const active = addressFields.filter((item) => !item.dependsOn || context.values.type === item.dependsOn.type);
  const missingFields = missing(context, active);
  if (missingFields.length) return { ok: false as const, status: "needs_input" as const, reasonFa: "برای ساخت Address Object چند مقدار لازم است.", missingFields };
  return {
    ok: true as const,
    actionPlanInput: actionPlan(context, "fortigate_create_address_object", "medium", {
      name: context.values.name,
      type: context.values.type,
      cidr: context.values.cidr,
      startIp: context.values.startIp,
      endIp: context.values.endIp,
      fqdn: context.values.fqdn,
      geo: context.values.geo,
      comment: context.values.comment,
    }),
    preview: { summaryFa: "Address Object از template ثبت‌شده FortiGate ساخته می‌شود." },
  };
}

const serviceFields = [
  field("name", "نام Service Object", "text", true, { validation: nameValidation }),
  field("protocol", "پروتکل", "select", true, { options: FORTIGATE_SERVICE_PROTOCOL_OPTIONS, validation: { allowedValues: FORTIGATE_SERVICE_PROTOCOL_OPTIONS.map((item) => item.value) } }),
  field("port", "پورت", "number", true, { placeholderFa: "8443", validation: portValidation }),
  field("comment", "توضیح", "textarea", false),
];

function buildService(context: GuidedActionBuildContext) {
  const missingFields = missing(context, serviceFields.filter((item) => item.required));
  if (missingFields.length) return { ok: false as const, status: "needs_input" as const, reasonFa: "برای ساخت Service Object چند مقدار لازم است.", missingFields };
  return {
    ok: true as const,
    actionPlanInput: actionPlan(context, "fortigate_create_service_object", "medium", {
      name: context.values.name,
      protocol: context.values.protocol,
      port: context.values.port,
      comment: context.values.comment,
    }),
    preview: { summaryFa: "Service Object با پروتکل کنترل‌شده و پورت معتبر ساخته می‌شود." },
  };
}

const vipFields = [
  field("name", "نام VIP", "text", true, { validation: nameValidation }),
  field("externalInterface", "اینترفیس بیرونی", "interfaceSelect", false, { dynamicOptions: { provider: "fortigate_interfaces" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
  field("externalIp", "IP بیرونی", "ip", true),
  field("mappedIp", "IP داخلی", "ip", true),
  field("protocol", "پروتکل", "select", true, { options: [{ labelFa: "TCP", value: "tcp", source: "existing_template" }], validation: { allowedValues: ["tcp"] }, helpFa: "template فعلی VIP فقط port forward TCP را به صورت کامل کامپایل می‌کند." }),
  field("externalPort", "پورت بیرونی", "number", true, { validation: portValidation }),
  field("mappedPort", "پورت داخلی", "number", true, { validation: portValidation }),
  field("createPolicy", "بعد از VIP Policy هم ساخته شود", "checkbox", false),
];

function buildVip(context: GuidedActionBuildContext) {
  const missingFields = missing(context, vipFields.filter((item) => item.required));
  if (missingFields.length) return { ok: false as const, status: "needs_input" as const, reasonFa: "برای ساخت VIP چند مقدار لازم است.", missingFields };
  return {
    ok: true as const,
    actionPlanInput: actionPlan(context, "fortigate_create_vip", "high", {
      name: context.values.name,
      externalIp: context.values.externalIp,
      mappedIp: context.values.mappedIp,
      externalPort: context.values.externalPort,
      mappedPort: context.values.mappedPort,
    }),
    preview: { summaryFa: "VIP با port forwarding بعد از تایید ساخته می‌شود؛ ساخت Policy جداگانه نیاز به Workflow Policy دارد." },
  };
}

const routeFields = [
  field("destinationCidr", "شبکه مقصد", "cidr", true, { placeholderFa: "0.0.0.0/0" }),
  field("gateway", "Gateway", "ip", true),
  field("device", "اینترفیس خروجی", "interfaceSelect", false, { dynamicOptions: { provider: "fortigate_interfaces" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
  field("comment", "توضیح", "textarea", false),
];

function buildRoute(context: GuidedActionBuildContext) {
  const missingFields = missing(context, routeFields.filter((item) => item.required));
  if (missingFields.length) return { ok: false as const, status: "needs_input" as const, reasonFa: "برای ساخت Static Route چند مقدار لازم است.", missingFields };
  return {
    ok: true as const,
    actionPlanInput: actionPlan(context, "fortigate_create_static_route", "high", {
      destinationCidr: context.values.destinationCidr,
      gateway: context.values.gateway,
      device: context.values.device,
      comment: context.values.comment,
    }),
    preview: { summaryFa: "Route جدید قبل از اجرا باید با مسیر قبلی مقایسه شود." },
  };
}

const vlanFields = [
  field("name", "نام VLAN Interface", "text", true, { validation: nameValidation }),
  field("parent", "اینترفیس والد", "interfaceSelect", true, { dynamicOptions: { provider: "fortigate_interfaces" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
  field("vlanId", "VLAN ID", "number", true, { validation: { min: 1, max: 4094 } }),
  field("cidr", "IP/Subnet", "cidr", false, { placeholderFa: "192.168.50.1/24" }),
  field("allowaccess", "دسترسی مدیریتی مجاز", "multiSelect", false, { options: FORTIGATE_ALLOWACCESS_OPTIONS, validation: { allowedValues: FORTIGATE_ALLOWACCESS_OPTIONS.map((item) => item.value) } }),
  field("comment", "توضیح", "textarea", false),
];

function buildVlan(context: GuidedActionBuildContext) {
  const missingFields = missing(context, vlanFields.filter((item) => item.required));
  if (missingFields.length) return { ok: false as const, status: "needs_input" as const, reasonFa: "برای ساخت VLAN Interface چند مقدار لازم است.", missingFields };
  return {
    ok: true as const,
    actionPlanInput: actionPlan(context, "fortigate_create_vlan_interface", "high", {
      name: context.values.name,
      parent: context.values.parent,
      vlanId: context.values.vlanId,
      cidr: context.values.cidr,
      comment: context.values.comment,
    }),
    preview: { summaryFa: "VLAN Interface بعد از snapshot و تایید اجرا ساخته می‌شود." },
  };
}

const vpnFields = [
  field("vpnScenario", "سناریوی VPN", "select", true, { options: FORTIGATE_VPN_SCENARIO_OPTIONS, validation: { allowedValues: FORTIGATE_VPN_SCENARIO_OPTIONS.map((item) => item.value) } }),
  field("name", "نام تونل", "text", true, { validation: nameValidation }),
  field("remoteGateway", "Remote Gateway", "ip", true),
  field("pskMode", "روش PSK", "select", true, { options: FORTIGATE_PSK_MODE_OPTIONS, validation: { allowedValues: FORTIGATE_PSK_MODE_OPTIONS.map((item) => item.value) } }),
  field("pskSecretRef", "SecretRef برای PSK", "generatedSecret", true, { secret: true, helpFa: "PSK خام در UI یا لاگ نگهداری نمی‌شود." }),
  field("localSubnets", "شبکه‌های محلی", "cidrList", false),
  field("remoteSubnets", "شبکه‌های سمت مقابل", "cidrList", false),
];

const guidedVpnTypeOptions = [
  { labelFa: "IPsec Site-to-Site", value: "ipsec_site_to_site", source: "project_default" as const },
  { labelFa: "SSL VPN", value: "ssl_vpn", source: "project_default" as const },
  { labelFa: "IPsec Remote Access - partial", value: "ipsec_remote_access", source: "project_default" as const },
];

const guidedAuthOptions = [
  { labelFa: "PSK", value: "psk", source: "project_default" as const },
  { labelFa: "Certificate - partial", value: "certificate", source: "project_default" as const },
];

const guidedPskOptions = [
  { labelFa: "تولید خودکار", value: "generate", source: "project_default" as const },
  { labelFa: "ورود دستی", value: "manual", source: "project_default" as const },
];

const guidedProposalOptions = [
  { labelFa: "AES256-SHA256", value: "aes256-sha256", source: "existing_template" as const },
  { labelFa: "AES128-SHA256", value: "aes128-sha256", source: "existing_template" as const },
];

const guidedVpnSteps = [
  {
    id: "vpn_type",
    titleFa: "نوع VPN",
    fields: [
      field("vpnType", "نوع VPN", "select", true, { options: guidedVpnTypeOptions, validation: { allowedValues: guidedVpnTypeOptions.map((item) => item.value) } }),
      field("name", "نام تونل", "text", false, { validation: nameValidation }),
    ],
  },
  {
    id: "vpn_networks",
    titleFa: "شبکه‌ها و مسیرها",
    fields: [
      field("localSubnets", "شبکه‌های محلی", "cidrList", true),
      field("remoteSubnets", "شبکه‌های سمت مقابل", "cidrList", true, { dependsOn: { vpnType: "ipsec_site_to_site" } }),
      field("vpnPoolCidr", "Pool VPN", "cidr", true, { dependsOn: { vpnType: "ssl_vpn" } }),
      field("allowedSubnets", "شبکه‌های مجاز", "cidrList", true),
    ],
  },
  {
    id: "vpn_gateway",
    titleFa: "اینترفیس و Gateway",
    fields: [
      field("wanInterface", "اینترفیس WAN", "interfaceSelect", true, { dynamicOptions: { provider: "fortigate_interfaces" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
      field("remoteGateway", "Remote Gateway", "text", true, { dependsOn: { vpnType: "ipsec_site_to_site" }, validation: { pattern: "^[A-Za-z0-9_.:-]{1,253}$" } }),
    ],
  },
  {
    id: "vpn_auth",
    titleFa: "احراز هویت و امنیت",
    fields: [
      field("authMethod", "روش احراز هویت", "select", true, { options: guidedAuthOptions, validation: { allowedValues: guidedAuthOptions.map((item) => item.value) } }),
      field("pskMode", "روش PSK", "select", true, { dependsOn: { authMethod: "psk" }, options: guidedPskOptions, validation: { allowedValues: guidedPskOptions.map((item) => item.value) } }),
      field("psk", "PSK", "password", true, { secret: true, dependsOn: { pskMode: "manual" } }),
      field("proposal", "Proposal", "select", false, { options: guidedProposalOptions, validation: { allowedValues: guidedProposalOptions.map((item) => item.value) } }),
    ],
  },
  {
    id: "vpn_policy",
    titleFa: "Policy و دسترسی",
    fields: [
      field("createFirewallPolicy", "Policy هم ساخته شود", "checkbox", false),
      field("natEnabled", "NAT فعال باشد", "checkbox", false),
      field("logTraffic", "لاگ ترافیک فعال باشد", "checkbox", false),
      field("enableAfterCreate", "بعد از ساخت فعال شود", "checkbox", false),
    ],
  },
  {
    id: "vpn_preview",
    titleFa: "پیش‌نمایش",
    descriptionFa: "خلاصه، تغییرات لازم، ریسک، پیش‌نمایش CLI در صورت وجود template، برنامه verification و rollback قبل از ساخت ActionPlan بررسی می‌شود.",
    fields: [],
  },
];

const vdomFields = [
  field("vdomName", "نام VDOM", "text", true, { validation: nameValidation }),
  field("mode", "Mode", "select", false, { options: [{ labelFa: "NAT", value: "nat", source: "project_default" }, { labelFa: "Transparent - planned", value: "transparent", source: "project_default" }], validation: { allowedValues: ["nat", "transparent"] } }),
  field("assignInterfaces", "اینترفیس‌ها", "multiSelect", false, { dynamicOptions: { provider: "fortigate_interfaces" } }),
  field("resourceLimits", "Resource limits - planned", "textarea", false),
  field("interVdomLink", "Inter-VDOM link - planned", "checkbox", false),
];

const zoneFields = [
  field("zoneName", "نام Zone", "text", true, { validation: nameValidation }),
  field("members", "اعضای Zone", "multiSelect", true, { dynamicOptions: { provider: "fortigate_interfaces" } }),
  field("intrazone", "Intrazone", "select", false, { options: [{ labelFa: "allow", value: "allow", source: "project_default" }, { labelFa: "deny", value: "deny", source: "project_default" }], validation: { allowedValues: ["allow", "deny"] } }),
  field("description", "توضیح", "textarea", false),
];

const sslVpnFields = [
  field("portal", "Portal", "text", true, { validation: nameValidation }),
  field("userGroup", "گروه کاربری", "userGroupSelect", true, { dynamicOptions: { provider: "fortigate_user_groups" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
  field("sourceInterface", "اینترفیس Listener", "interfaceSelect", true, { dynamicOptions: { provider: "fortigate_interfaces" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
  field("sourceAddress", "Source Address", "addressObjectSelect", true, { dynamicOptions: { provider: "fortigate_address_objects" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
  field("port", "پورت SSL VPN", "number", true, { validation: portValidation }),
];

const policyMoveFields = [
  field("operation", "عملیات", "select", true, { options: [{ labelFa: "فعال", value: "enable", source: "existing_template" }, { labelFa: "غیرفعال", value: "disable", source: "existing_template" }, { labelFa: "جابجایی", value: "move", source: "existing_template" }], validation: { allowedValues: ["enable", "disable", "move"] } }),
  field("policyId", "شماره Policy", "number", true, { dynamicOptions: { provider: "fortigate_policies" }, validation: { min: 1 } }),
  field("direction", "جهت جابجایی", "select", false, { options: [{ labelFa: "قبل از", value: "before", source: "existing_template" }, { labelFa: "بعد از", value: "after", source: "existing_template" }], validation: { allowedValues: ["before", "after"] }, dependsOn: { operation: "move" } }),
  field("targetPolicyId", "Policy مرجع", "number", false, { validation: { min: 1 }, dependsOn: { operation: "move" } }),
];

function unsupported(reasonFa: string) {
  return () => ({ ok: false as const, status: "planned" as const, reasonFa });
}

function textValue(context: GuidedActionBuildContext, key: string, fallback = "") {
  const value = context.values[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function listValue(context: GuidedActionBuildContext, key: string) {
  const value = context.values[key];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function enabledLabel(value: unknown) {
  return value === true ? "فعال" : "غیرفعال";
}

function buildFortiGateVpnPreview(context: GuidedActionBuildContext) {
  const required = guidedVpnSteps.flatMap((step) => step.fields).filter((item) => item.required);
  const missingFields = missing(context, required.filter((item) => !item.dependsOn || Object.entries(item.dependsOn).every(([key, value]) => context.values[key] === value)));
  if (missingFields.length) return { ok: false as const, status: "needs_input" as const, reasonFa: "برای ساخت پیش‌نمایش VPN چند مقدار لازم هنوز کامل نیست.", missingFields };

  const vpnType = textValue(context, "vpnType", "ipsec_site_to_site");
  const tunnelName = textValue(context, "name", `guided-${vpnType}-vpn`);
  const localSubnets = listValue(context, "localSubnets");
  const remoteSubnets = listValue(context, "remoteSubnets");
  const allowedSubnets = listValue(context, "allowedSubnets");
  const wanInterface = textValue(context, "wanInterface");
  const remoteGateway = textValue(context, "remoteGateway");
  const authMethod = textValue(context, "authMethod", "psk");
  const pskMode = textValue(context, "pskMode", "generate");
  const proposal = textValue(context, "proposal", "aes256-sha256");
  const missingTemplates = vpnType === "ssl_vpn"
    ? ["fortigate.guided_ssl_vpn_settings_template", "fortigate.guided_ssl_vpn_policy_template", "fortigate.guided_ssl_vpn_verification_parser"]
    : ["fortigate.create_ipsec_site_to_site_vpn", "fortigate.guided_ipsec_phase1_template", "fortigate.guided_ipsec_phase2_template", "fortigate.guided_ipsec_policy_route_template", "fortigate.guided_ipsec_verification_parser"];
  const verificationPlan = vpnType === "ssl_vpn"
    ? ["show vpn ssl settings", "get vpn ssl monitor", "show firewall policy"]
    : ["show vpn ipsec phase1-interface", "show vpn ipsec phase2-interface", "get vpn ipsec tunnel summary", "show firewall policy"];
  const rollbackPlan = [
    "قبل از اجرا snapshot/export تنظیمات گرفته شود.",
    "در صورت تکمیل template اجرایی، phase2/phase1 ساخته‌شده، route و policyهای وابسته حذف یا به snapshot قبلی برگردانده شوند.",
    "PSK یا password در rollback و audit ثبت نمی‌شود.",
  ];
  const cliOutline = vpnType === "ssl_vpn"
    ? [
        "config vpn ssl settings",
        "  # set source-interface/source-address/port after template verification",
        "end",
        "config firewall policy",
        "  # create SSL-VPN access policy after user confirmation",
        "end",
      ]
    : [
        "execute backup config flash before-guided-vpn",
        "config vpn ipsec phase1-interface",
        `  edit \"${tunnelName}\"`,
        `  set interface \"${wanInterface}\"`,
        `  set remote-gw ${remoteGateway || "<remote-gateway>"}`,
        "  set psksecret [secret]",
        "  next",
        "end",
        "config vpn ipsec phase2-interface",
        `  edit \"${tunnelName}-p2\"`,
        `  set phase1name \"${tunnelName}\"`,
        "  # set local/remote selectors from approved CIDR lists",
        "  next",
        "end",
        "config router static",
        "  # create route only if requested/needed",
        "end",
        "config firewall policy",
        "  # create policy only if createFirewallPolicy=true",
        "end",
      ];
  const structuredPreview = {
    summaryFa: "پیش‌نمایش ساختار اکشن VPN ساخته شد، اما اجرای واقعی این سناریو هنوز کامل نشده است.",
    fieldsFa: {
      "نوع VPN": vpnType,
      "شبکه‌های محلی": localSubnets,
      "شبکه‌های سمت مقابل": remoteSubnets,
      "شبکه‌های مجاز": allowedSubnets,
      "WAN interface": wanInterface,
      "Remote Gateway": remoteGateway || "نیازمند تکمیل در سناریوی انتخاب‌شده",
      "احراز هویت": authMethod === "psk" ? `PSK (${pskMode}) - مقدار مخفی است` : authMethod,
      "Policy/NAT/Logging choices": {
        createFirewallPolicy: enabledLabel(context.values.createFirewallPolicy),
        natEnabled: enabledLabel(context.values.natEnabled),
        logTraffic: enabledLabel(context.values.logTraffic),
        enableAfterCreate: enabledLabel(context.values.enableAfterCreate),
      },
      "ریسک": "بالا؛ تغییر VPN می‌تواند روی دسترسی بین شبکه‌ها و مسیرها اثر بگذارد.",
      "پیش‌نیازها": ["انتخاب دستگاه FortiGate", "snapshot/export تنظیمات", "تایید route و policy", "نگهداری secret در vault/secretRef"],
      "تغییرات پیشنهادی": vpnType === "ssl_vpn"
        ? ["آماده‌سازی تنظیمات SSL VPN", "ساخت policy دسترسی", "بررسی listener و source-address"]
        : ["ساخت phase1-interface", "ساخت phase2-interface", "ساخت route در صورت نیاز", "ساخت address object و firewall policy در صورت انتخاب کاربر"],
      "برنامه verification": verificationPlan,
      "برنامه rollback": rollbackPlan,
    },
    cliOutline,
    missingTemplates,
    verificationPlan,
    rollbackPlan,
    researchNeeded: [
      "FortiOS CLI دقیق Phase1/Phase2، proposal، selector و route باید با نسخه دستگاه تایید شود.",
      "template اجرای چندمرحله‌ای و parser verification هنوز کامل نشده است.",
    ],
  };

  return {
    ok: true as const,
    actionPlanInput: {
      source: "ai" as const,
      deviceId: context.deviceId,
      vendor: "fortigate" as const,
      actionType: "fortigate_guided_vpn_setup",
      riskLevel: "high" as const,
      requestedBy: context.requestedBy,
      parametersJson: {
        vendor: "fortigate",
        vpnType,
        name: tunnelName,
        localSubnets,
        remoteSubnets,
        allowedSubnets,
        wanInterface,
        remoteGateway,
        authMethod,
        pskMode,
        pskProvided: context.values.psk !== undefined ? "[secret]" : undefined,
        proposal,
        createFirewallPolicy: context.values.createFirewallPolicy === true,
        natEnabled: context.values.natEnabled === true,
        logTraffic: context.values.logTraffic === true,
        enableAfterCreate: context.values.enableAfterCreate === true,
        source: "guided_action_wizard",
        implementationState: "partial",
        executionSupport: "planned_or_partial",
        executable: false,
        connectorType: "fortigate-ssh",
        operationCategory: "vpn",
        blueprintId: context.blueprintId,
        reasonFa: "قالب اجرای واقعی این سناریو هنوز کامل نشده است.",
        missingTemplates,
        structuredPreview,
        cliOutline,
        verificationPlan,
        rollbackPlan,
        metadata: {
          source: "guided_action_wizard",
          blueprintId: context.blueprintId,
          initialRequest: context.initialRequest,
          vendor: "fortigate",
          actionType: "fortigate.guided_vpn_setup",
          storedActionType: "fortigate_guided_vpn_setup",
          operationCategory: "vpn",
          executionSupport: "planned_or_partial",
          implementationState: "partial",
          executable: false,
          connectorType: "fortigate-ssh",
          executionTemplateRef: null,
          missingTemplates,
          reasonFa: "قالب اجرای واقعی این سناریو هنوز کامل نشده است.",
          normalizedParams: {
            vpnType,
            name: tunnelName,
            localSubnets,
            remoteSubnets,
            allowedSubnets,
            wanInterface,
            remoteGateway,
            authMethod,
            pskMode,
            proposal,
            createFirewallPolicy: context.values.createFirewallPolicy === true,
            natEnabled: context.values.natEnabled === true,
            logTraffic: context.values.logTraffic === true,
            enableAfterCreate: context.values.enableAfterCreate === true,
          },
          requiredParamsSatisfied: true,
          previewGenerated: true,
          executed: false,
          connectorInvoked: false,
          lastExecutionStatus: "preview_only",
        },
      },
    },
    preview: structuredPreview,
  };
}

export const FORTIGATE_GUIDED_BLUEPRINTS = Object.freeze([
  {
    id: "fortigate_guided_vpn_setup",
    vendor: "fortigate",
    titleFa: "راه‌اندازی مرحله‌ای VPN فورتی‌گیت",
    descriptionFa: "VPN را مرحله‌به‌مرحله با نوع، شبکه‌ها، Gateway، احراز هویت، Policy و پیش‌نمایش جمع‌آوری می‌کند.",
    category: "vpn",
    risk: "high",
    actionKind: "guided_action",
    implementationState: "partial",
    researchStatus: "partial",
    supportedConnectors: ["fortigate-ssh"],
    requiredCapabilities: ["fortigate_create_ipsec_tunnel", "fortigate_update_ssl_vpn_settings"],
    fixedOptionSources: { vpnType: "project_default", authMethod: "project_default", pskMode: "project_default", proposal: "existing_template" },
    dynamicOptionSources: { wanInterface: "fortigate_interfaces" },
    prerequisites: [{ id: "vpn_design_review", titleFa: "بازبینی طراحی VPN و Secret", required: true }],
    steps: guidedVpnSteps,
    buildActionPlan: buildFortiGateVpnPreview,
    verification: { commands: ["show vpn ipsec phase1-interface", "show vpn ssl settings", "get vpn ipsec tunnel summary"] },
    rollback: { template: "manual_snapshot_backed" },
    uiHints: { limitationFa: "Execution template کامل VPN هنوز پیاده‌سازی نشده است؛ ActionPlan اجرایی ساخته نمی‌شود." },
  },
  {
    id: "fortigate_guided_vdom_create",
    vendor: "fortigate",
    titleFa: "ساخت مرحله‌ای VDOM فورتی‌گیت",
    descriptionFa: "VDOM یک تغییر پرریسک است و قبل از اجرا به جمع‌آوری نام، mode، اینترفیس‌ها و تایید مضاعف نیاز دارد.",
    category: "vdom",
    risk: "critical",
    actionKind: "guided_action",
    implementationState: "planned",
    researchStatus: "partial",
    supportedConnectors: ["fortigate-ssh"],
    requiredCapabilities: ["fortigate_create_vdom"],
    dynamicOptionSources: { assignInterfaces: "fortigate_interfaces" },
    prerequisites: [{ id: "double_confirm", titleFa: "تایید مضاعف قبل از اجرا", required: true }],
    steps: [{ id: "vdom_details", titleFa: "مشخصات VDOM", fields: vdomFields }],
    buildActionPlan: unsupported("VDOM creation هنوز template اجرایی کامل ندارد. این workflow فقط اطلاعات و پیش‌نمایش ساختار اکشن را آماده می‌کند."),
    verification: { commands: ["show system vdom"] },
    rollback: { template: "manual_snapshot_backed_double_confirmation" },
    uiHints: { requiresDoubleConfirmation: true },
  },
  {
    id: "fortigate_guided_zone_create",
    vendor: "fortigate",
    titleFa: "ساخت مرحله‌ای Zone فورتی‌گیت",
    descriptionFa: "Zone را با نام، اعضا، Intrazone و توضیح اختیاری آماده ساخت می‌کند.",
    category: "zone",
    risk: "high",
    actionKind: "guided_action",
    implementationState: "implemented",
    researchStatus: "verified_from_existing_templates",
    supportedConnectors: ["fortigate-ssh"],
    requiredCapabilities: ["fortigate_create_zone"],
    dynamicOptionSources: { members: "fortigate_interfaces" },
    prerequisites: [{ id: "interface_snapshot", titleFa: "Snapshot اینترفیس‌ها", required: true }],
    steps: [{ id: "zone_details", titleFa: "مشخصات Zone", fields: zoneFields }],
    buildActionPlan: (context) => {
      const required = zoneFields.filter((item) => ["zoneName", "members"].includes(item.key));
      const missingFields = missing(context, required);
      if (missingFields.length) return { ok: false as const, status: "needs_input" as const, reasonFa: "برای ساخت Zone نام و اعضا لازم است.", missingFields };
      const members = Array.isArray(context.values.members) ? context.values.members : String(context.values.members).split(",").map((item) => item.trim()).filter(Boolean);
      return {
        ok: true as const,
        actionPlanInput: actionPlan(context, "fortigate_create_zone", "high", {
          name: context.values.zoneName,
          interfaces: members,
          intrazone: context.values.intrazone,
          description: context.values.description,
        }),
        preview: { summaryFa: "Zone بعد از تایید در Action Center ساخته می‌شود." },
      };
    },
    verification: { commands: ["show system zone"] },
    rollback: { template: "delete_created_zone" },
  },
  {
    id: "fortigate_guided_firewall_policy_create",
    vendor: "fortigate",
    titleFa: "ساخت مرحله‌ای Policy فورتی‌گیت",
    descriptionFa: "Policy جدید را با انتخاب اینترفیس، آبجکت، سرویس، NAT و لاگ می‌سازد.",
    category: "policy",
    risk: "high",
    actionKind: "guided_action",
    implementationState: "implemented",
    researchStatus: "verified_from_existing_templates",
    supportedConnectors: ["fortigate-ssh"],
    requiredCapabilities: ["fortigate_create_policy"],
    fixedOptionSources: { action: "existing_template", logTraffic: "existing_template" },
    dynamicOptionSources: { srcintf: "fortigate_interfaces", dstintf: "fortigate_interfaces", srcaddr: "fortigate_address_objects", dstaddr: "fortigate_address_objects", services: "fortigate_service_objects" },
    prerequisites: [{ id: "snapshot", titleFa: "Snapshot تنظیمات", required: true }],
    steps: [{ id: "policy_basics", titleFa: "مشخصات Policy", fields: firewallPolicyFields }],
    buildActionPlan: buildPolicy,
    verification: { commands: ["show firewall policy"] },
    rollback: { template: "delete_created_policy_and_source_object" },
    auditEvents: ["guided_policy_started", "guided_policy_plan_built"],
    uiHints: { defaultDisabled: true, showOrderImpact: true },
  },
  {
    id: "fortigate_guided_address_object_create",
    vendor: "fortigate",
    titleFa: "ساخت Address Object",
    descriptionFa: "Address Object را با نوع کنترل‌شده و اعتبارسنجی IP/CIDR می‌سازد.",
    category: "object",
    risk: "medium",
    actionKind: "guided_action",
    implementationState: "implemented",
    researchStatus: "verified_from_official_docs",
    supportedConnectors: ["fortigate-ssh"],
    requiredCapabilities: ["fortigate_create_address_object"],
    fixedOptionSources: { type: "official_docs" },
    prerequisites: [],
    steps: [{ id: "address_details", titleFa: "جزئیات آبجکت آدرس", fields: addressFields }],
    buildActionPlan: buildAddress,
    verification: { commands: ["show firewall address"] },
    rollback: { template: "delete_created_address_object" },
  },
  {
    id: "fortigate_guided_service_object_create",
    vendor: "fortigate",
    titleFa: "ساخت Service Object",
    descriptionFa: "Service Object سفارشی را با پروتکل‌های پشتیبانی‌شده template می‌سازد.",
    category: "object",
    risk: "medium",
    actionKind: "guided_action",
    implementationState: "implemented",
    researchStatus: "verified_from_existing_templates",
    supportedConnectors: ["fortigate-ssh"],
    requiredCapabilities: ["fortigate_create_service_object"],
    fixedOptionSources: { protocol: "existing_template" },
    prerequisites: [],
    steps: [{ id: "service_details", titleFa: "جزئیات سرویس", fields: serviceFields }],
    buildActionPlan: buildService,
    verification: { commands: ["show firewall service custom"] },
    rollback: { template: "delete_created_service" },
  },
  {
    id: "fortigate_guided_vip_port_forward_create",
    vendor: "fortigate",
    titleFa: "ساخت VIP / Port Forward",
    descriptionFa: "VIP با port forwarding کنترل‌شده می‌سازد.",
    category: "nat",
    risk: "high",
    actionKind: "guided_action",
    implementationState: "partial",
    researchStatus: "verified_from_existing_templates",
    supportedConnectors: ["fortigate-ssh"],
    requiredCapabilities: ["fortigate_create_vip"],
    fixedOptionSources: { protocol: "existing_template" },
    dynamicOptionSources: { externalInterface: "fortigate_interfaces" },
    prerequisites: [{ id: "policy_reference_check", titleFa: "بررسی Policyهای وابسته", required: true }],
    steps: [{ id: "vip_details", titleFa: "جزئیات VIP", fields: vipFields }],
    buildActionPlan: buildVip,
    verification: { commands: ["show firewall vip", "show firewall policy"] },
    rollback: { template: "delete_created_vip_artifact" },
    uiHints: { limitationFa: "ساخت Policy همراه VIP در این نسخه جداگانه انجام می‌شود." },
  },
  {
    id: "fortigate_guided_static_route_create",
    vendor: "fortigate",
    titleFa: "ساخت Static Route",
    descriptionFa: "Route جدید را با نمایش مسیر قدیم/جدید آماده اجرا می‌کند.",
    category: "routing",
    risk: "high",
    actionKind: "guided_action",
    implementationState: "implemented",
    researchStatus: "verified_from_existing_templates",
    supportedConnectors: ["fortigate-ssh"],
    requiredCapabilities: ["fortigate_create_static_route"],
    dynamicOptionSources: { device: "fortigate_interfaces" },
    prerequisites: [{ id: "route_snapshot", titleFa: "خواندن جدول Routing قبل از تغییر", required: true }],
    steps: [{ id: "route_details", titleFa: "جزئیات Route", fields: routeFields }],
    buildActionPlan: buildRoute,
    verification: { commands: ["get router info routing-table all"] },
    rollback: { template: "remove_created_static_route" },
  },
  {
    id: "fortigate_guided_ipsec_vpn_setup",
    vendor: "fortigate",
    titleFa: "راه‌اندازی مرحله‌ای IPsec VPN",
    descriptionFa: "پارامترهای VPN را جمع‌آوری می‌کند؛ اجرای کامل تا تکمیل templateهای Phase1/Phase2 در حالت partial است.",
    category: "vpn",
    risk: "high",
    actionKind: "guided_action",
    implementationState: "partial",
    researchStatus: "partial",
    supportedConnectors: ["fortigate-ssh"],
    requiredCapabilities: ["fortigate_create_ipsec_tunnel"],
    fixedOptionSources: { vpnScenario: "project_default", pskMode: "project_default" },
    prerequisites: [{ id: "secret_ref", titleFa: "PSK فقط با SecretRef", required: true }],
    steps: [{ id: "vpn_basics", titleFa: "مشخصات تونل", fields: vpnFields }],
    buildActionPlan: unsupported("Workflow VPN هنوز فقط جمع‌آوری کنترل‌شده اطلاعات دارد و ActionPlan اجرایی کامل نمی‌سازد."),
    verification: { commands: ["show vpn ipsec phase1-interface", "show vpn ipsec phase2-interface", "get vpn ipsec tunnel summary"] },
    rollback: { template: "manual_snapshot_backed" },
  },
  {
    id: "fortigate_guided_ssl_vpn_setup",
    vendor: "fortigate",
    titleFa: "راه‌اندازی مرحله‌ای SSL VPN",
    descriptionFa: "تنظیمات SSL VPN را با انتخاب Portal، گروه کاربری و Listener جمع‌آوری می‌کند.",
    category: "vpn",
    risk: "critical",
    actionKind: "guided_action",
    implementationState: "partial",
    researchStatus: "partial",
    supportedConnectors: ["fortigate-ssh"],
    requiredCapabilities: ["fortigate_update_ssl_vpn_settings", "fortigate_bind_ssl_vpn_user_group"],
    dynamicOptionSources: { userGroup: "fortigate_user_groups", sourceInterface: "fortigate_interfaces", sourceAddress: "fortigate_address_objects" },
    prerequisites: [{ id: "listener_warning", titleFa: "هشدار فعال‌سازی Listener عمومی", required: true }],
    steps: [{ id: "ssl_vpn_details", titleFa: "جزئیات SSL VPN", fields: sslVpnFields }],
    buildActionPlan: unsupported("Workflow SSL VPN هنوز ActionPlan اجرایی کامل نمی‌سازد و نیاز به تکمیل templateهای Portal/Rule دارد."),
    verification: { commands: ["show vpn ssl settings"] },
    rollback: { template: "manual_snapshot_backed" },
  },
  {
    id: "fortigate_guided_interface_vlan_create",
    vendor: "fortigate",
    titleFa: "ساخت VLAN Interface",
    descriptionFa: "VLAN Interface را با parent، VLAN ID و IP معتبر آماده اجرا می‌کند.",
    category: "interface",
    risk: "high",
    actionKind: "guided_action",
    implementationState: "implemented",
    researchStatus: "verified_from_existing_templates",
    supportedConnectors: ["fortigate-ssh"],
    requiredCapabilities: ["fortigate_create_vlan_interface"],
    fixedOptionSources: { allowaccess: "existing_template" },
    dynamicOptionSources: { parent: "fortigate_interfaces" },
    prerequisites: [{ id: "interface_snapshot", titleFa: "Snapshot اینترفیس‌ها", required: true }],
    steps: [{ id: "vlan_details", titleFa: "جزئیات VLAN", fields: vlanFields }],
    buildActionPlan: buildVlan,
    verification: { commands: ["show system interface"] },
    rollback: { template: "delete_created_vlan_interface" },
  },
  {
    id: "fortigate_guided_policy_enable_disable_or_move",
    vendor: "fortigate",
    titleFa: "فعال/غیرفعال/جابجایی Policy",
    descriptionFa: "Policy موجود را برای فعال‌سازی، غیرفعال‌سازی یا جابجایی انتخاب می‌کند.",
    category: "policy",
    risk: "high",
    actionKind: "guided_action",
    implementationState: "partial",
    researchStatus: "verified_from_existing_templates",
    supportedConnectors: ["fortigate-ssh"],
    requiredCapabilities: ["fortigate_enable_policy", "fortigate_disable_policy", "fortigate_move_policy"],
    fixedOptionSources: { operation: "existing_template", direction: "existing_template" },
    dynamicOptionSources: { policyId: "fortigate_policies" },
    prerequisites: [{ id: "policy_order", titleFa: "نمایش اثر روی ترتیب Policyها", required: true }],
    steps: [{ id: "policy_operation", titleFa: "انتخاب Policy و عملیات", fields: policyMoveFields }],
    buildActionPlan: unsupported("این Workflow برای انتخاب runtime آماده است اما build چندشاخه enable/disable/move در session هنوز تکمیل نشده است."),
    verification: { commands: ["show firewall policy"] },
    rollback: { template: "restore_policy_order_manual" },
  },
] as GuidedActionBlueprint[]);

function normalize(value: string) {
  return value.replace(/\u200c/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function extractCidr(text: string) {
  return text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b/)?.[0];
}

function extractPort(text: string) {
  const value = Number(text.match(/\b(\d{1,5})\b/)?.[1]);
  return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : undefined;
}

function extractNamedValue(text: string, keyword: string) {
  const value = text.match(new RegExp(`${keyword}\\s+(?:به\\s+اسم|اسم|named|name)?\\s*([A-Za-z0-9_.:-]{2,79})`, "i"))?.[1]
    ?? text.match(/(?:به\s+اسم|اسم|named|name)\s+([A-Za-z0-9_.:-]{2,79})/i)?.[1];
  return value && /^[a-z0-9_.:-]+$/.test(value) ? value.toUpperCase() : value;
}

export function resolveFortiGateGuidedIntent(userText: string) {
  const text = normalize(userText);
  if (/(vpn|ipsec|تونل|وی\s*پی\s*ان)/i.test(text) && /(بساز|راه|تنظیم|create|setup)/i.test(text)) {
    const vpnType = /ssl\s*vpn/i.test(text) ? "ssl_vpn" : /remote/i.test(text) ? "ipsec_remote_access" : /vpn|ipsec|تونل/i.test(text) ? "ipsec_site_to_site" : undefined;
    return { blueprintId: "fortigate_guided_vpn_setup", initialValues: { vpnType }, reasonFa: "این درخواست چندمرحله‌ای است و باید اطلاعات تکمیلی از شما گرفته شود." };
  }
  if (/(ssl\s*vpn)/i.test(text) && /(بساز|تنظیم|setup|create)/i.test(text)) {
    return { blueprintId: "fortigate_guided_vpn_setup", initialValues: { vpnType: "ssl_vpn" }, reasonFa: "این درخواست چندمرحله‌ای است و باید اطلاعات تکمیلی از شما گرفته شود." };
  }
  if (/(vdom|وی\s*دام)/i.test(text) && /(بساز|ایجاد|create)/i.test(text)) {
    return { blueprintId: "fortigate_guided_vdom_create", initialValues: { vdomName: extractNamedValue(text, "vdom") }, reasonFa: "این درخواست چندمرحله‌ای است و باید اطلاعات تکمیلی از شما گرفته شود." };
  }
  if (/(zone|زون)/i.test(text) && /(بساز|ایجاد|اضافه|بنداز|create|add)/i.test(text)) {
    return { blueprintId: "fortigate_guided_zone_create", initialValues: { zoneName: extractNamedValue(text, "(?:zone|زون)") }, reasonFa: "این درخواست چندمرحله‌ای است و باید اطلاعات تکمیلی از شما گرفته شود." };
  }
  if (/(policy|رول|قانون)/i.test(text) && /(بساز|دسترسی|create|اجازه)/i.test(text)) {
    return { blueprintId: "fortigate_guided_firewall_policy_create", initialValues: { sourceCidr: extractCidr(text), dstaddr: /اینترنت|internet/i.test(text) ? "all" : undefined, services: /اینترنت|internet/i.test(text) ? ["ALL"] : undefined, action: "accept", nat: /اینترنت|internet/i.test(text), logTraffic: "all", disabled: true }, reasonFa: "این درخواست چندمرحله‌ای است و باید اطلاعات تکمیلی از شما گرفته شود." };
  }
  if (/(service|سرویس)/i.test(text) && /(port|پورت|\d{1,5})/i.test(text) && /(بساز|create)/i.test(text)) {
    const port = extractPort(text);
    return { blueprintId: "fortigate_guided_service_object_create", initialValues: { port }, reasonFa: "ساخت Service Object باید با پروتکل کنترل‌شده انجام شود." };
  }
  if (/(address|object|آبجکت|آدرس)/i.test(text) && /(بساز|اضافه|create)/i.test(text)) {
    return { blueprintId: "fortigate_guided_address_object_create", initialValues: { cidr: extractCidr(text), type: "subnet" }, reasonFa: "ساخت Address Object با نوع کنترل‌شده انجام می‌شود." };
  }
  if (/(vip|nat|فوروارد|port forward)/i.test(text) && /(بساز|create|کن)/i.test(text)) {
    return { blueprintId: "fortigate_guided_vip_port_forward_create", initialValues: { protocol: "tcp" }, reasonFa: "این درخواست چندمرحله‌ای است و باید اطلاعات تکمیلی از شما گرفته شود." };
  }
  if (/(route|روت|gateway|گیت)/i.test(text) && /(بساز|عوض|تغییر|create)/i.test(text)) {
    return { blueprintId: "fortigate_guided_static_route_create", initialValues: { destinationCidr: extractCidr(text) }, reasonFa: "Route باید با مسیر قدیم/جدید و تایید کنترل‌شده ساخته شود." };
  }
  if (/(vlan|subinterface|اینترفیس)/i.test(text) && /(بساز|create|آی پی|ip)/i.test(text)) {
    return { blueprintId: "fortigate_guided_interface_vlan_create", initialValues: {}, reasonFa: "ساخت VLAN Interface چندمرحله‌ای است." };
  }
  return null;
}
