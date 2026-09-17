import type { GuidedActionBuildContext } from "../../types.js";
import { createEphemeralSecretRef } from "../../../services/ephemeral-secret.service.js";
import {
  FORTIGATE_ALLOWACCESS_OPTIONS,
  FORTIGATE_ENABLE_DISABLE_OPTIONS,
  FORTIGATE_PSK_MODE_OPTIONS,
  FORTIGATE_VPN_SCENARIO_OPTIONS,
} from "./fortigate-options.js";
import { actionPlan, field, missing, nameValidation, portValidation } from "./fortigate-blueprint-shared.js";
export const vpnFields = [
  field("vpnScenario", "سناریوی VPN", "select", true, { options: FORTIGATE_VPN_SCENARIO_OPTIONS, validation: { allowedValues: FORTIGATE_VPN_SCENARIO_OPTIONS.map((item) => item.value) } }),
  field("name", "نام تونل", "text", true, { validation: nameValidation }),
  field("remoteGateway", "Remote Gateway", "ip", true),
  field("pskMode", "روش PSK", "select", true, { options: FORTIGATE_PSK_MODE_OPTIONS, validation: { allowedValues: FORTIGATE_PSK_MODE_OPTIONS.map((item) => item.value) } }),
  field("pskSecretRef", "SecretRef برای PSK", "generatedSecret", true, { secret: true, helpFa: "PSK خام در UI یا لاگ نگهداری نمی‌شود." }),
  field("localSubnets", "شبکه‌های محلی", "cidrList", false),
  field("remoteSubnets", "شبکه‌های سمت مقابل", "cidrList", false),
];

export const guidedVpnTypeOptions = [
  { labelFa: "IPsec Site-to-Site", value: "ipsec_site_to_site", source: "project_default" as const },
  { labelFa: "SSL VPN", value: "ssl_vpn", source: "project_default" as const },
  { labelFa: "IPsec Remote Access - partial", value: "ipsec_remote_access", source: "project_default" as const },
];

export const guidedAuthOptions = [
  { labelFa: "PSK", value: "psk", source: "project_default" as const },
  { labelFa: "Certificate - partial", value: "certificate", source: "project_default" as const },
];

export const guidedPskOptions = [
  { labelFa: "تولید خودکار", value: "generate", source: "project_default" as const },
  { labelFa: "ورود دستی", value: "manual", source: "project_default" as const },
];

export const guidedProposalOptions = [
  { labelFa: "AES256-SHA256", value: "aes256-sha256", source: "existing_template" as const },
  { labelFa: "AES128-SHA256", value: "aes128-sha256", source: "existing_template" as const },
];

export const guidedVpnSteps = [
  {
    id: "vpn_type",
    titleFa: "نوع VPN",
    fields: [
      field("vpnType", "نوع VPN", "select", true, { options: guidedVpnTypeOptions, validation: { allowedValues: guidedVpnTypeOptions.map((item) => item.value) } }),
      field("vpnName", "VPN Name", "text", true, { placeholderFa: "branch-office-vpn", validation: nameValidation }),
    ],
  },
  {
    id: "vpn_networks",
    titleFa: "شبکه‌ها و مسیرها",
    fields: [
      field("localSubnet", "Local Subnet", "cidr", true, { placeholderFa: "192.168.7.0/24" }),
      field("remoteSubnet", "Remote Subnet", "cidr", true, { dependsOn: { vpnType: "ipsec_site_to_site" }, placeholderFa: "10.20.30.0/24" }),
      field("vpnPoolCidr", "Pool VPN", "cidr", true, { dependsOn: { vpnType: "ssl_vpn" } }),
      field("allowedSubnets", "شبکه‌های مجاز", "cidrList", true),
    ],
  },
  {
    id: "vpn_gateway",
    titleFa: "اینترفیس و Gateway",
    fields: [
      field("wanInterface", "WAN/Gateway Interface", "interfaceSelect", true, { placeholderFa: "port2", dynamicOptions: { provider: "fortigate_interfaces" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
      field("lanInterface", "LAN/Internal Interface", "interfaceSelect", true, { dependsOn: { vpnType: "ipsec_site_to_site" }, placeholderFa: "port1", dynamicOptions: { provider: "fortigate_interfaces" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
      field("remoteGateway", "Remote Gateway", "text", true, { dependsOn: { vpnType: "ipsec_site_to_site" }, placeholderFa: "185.238.45.165", validation: { pattern: "^[A-Za-z0-9_.:-]{1,253}$" } }),
    ],
  },
  {
    id: "vpn_auth",
    titleFa: "احراز هویت و امنیت",
    fields: [
      field("authMethod", "روش احراز هویت", "select", true, { options: guidedAuthOptions, validation: { allowedValues: guidedAuthOptions.map((item) => item.value) } }),
      field("pskMode", "روش PSK", "select", false, { dependsOn: { authMethod: "psk" }, options: guidedPskOptions, validation: { allowedValues: guidedPskOptions.map((item) => item.value) } }),
      field("psk", "Pre-shared Key", "password", true, { secret: true, dependsOn: { authMethod: "psk" } }),
      field("proposal", "Proposal", "select", false, { options: guidedProposalOptions, validation: { allowedValues: guidedProposalOptions.map((item) => item.value) } }),
      field("dhGroup", "DH Group", "select", false, { options: [{ labelFa: "14", value: "14", source: "existing_template" }, { labelFa: "5", value: "5", source: "existing_template" }, { labelFa: "19", value: "19", source: "existing_template" }, { labelFa: "20", value: "20", source: "existing_template" }], validation: { allowedValues: ["5", "14", "19", "20"] } }),
      field("ikeVersion", "IKE Version", "select", false, { options: [{ labelFa: "2", value: "2", source: "existing_template" }, { labelFa: "1", value: "1", source: "existing_template" }], validation: { allowedValues: ["1", "2"] } }),
    ],
  },
  {
    id: "vpn_policy",
    titleFa: "Policy و دسترسی",
    fields: [
      field("createFirewallPolicy", "Policy هم ساخته شود", "checkbox", false),
      field("createStaticRoute", "Route سمت مقابل ساخته شود", "checkbox", false),
      field("natTraversal", "NAT Traversal", "checkbox", false),
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

export const vdomFields = [
  field("vdomName", "نام VDOM", "text", true, { validation: nameValidation }),
  field("mode", "Mode", "select", false, { options: [{ labelFa: "NAT", value: "nat", source: "project_default" }, { labelFa: "Transparent - planned", value: "transparent", source: "project_default" }], validation: { allowedValues: ["nat", "transparent"] } }),
  field("assignInterfaces", "اینترفیس‌ها", "multiSelect", false, { dynamicOptions: { provider: "fortigate_interfaces" } }),
  field("resourceLimits", "Resource limits - planned", "textarea", false),
  field("interVdomLink", "Inter-VDOM link - planned", "checkbox", false),
];

export const zoneFields = [
  field("zoneName", "نام Zone", "text", true, { validation: nameValidation }),
  field("members", "اعضای Zone", "multiSelect", true, { dynamicOptions: { provider: "fortigate_interfaces" } }),
  field("intrazone", "Intrazone", "select", false, { options: [{ labelFa: "allow", value: "allow", source: "project_default" }, { labelFa: "deny", value: "deny", source: "project_default" }], validation: { allowedValues: ["allow", "deny"] } }),
  field("description", "توضیح", "textarea", false),
];

export const sslVpnFields = [
  field("portal", "Portal", "text", true, { validation: nameValidation }),
  field("userGroup", "گروه کاربری", "userGroupSelect", true, { dynamicOptions: { provider: "fortigate_user_groups" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
  field("sourceInterface", "اینترفیس Listener", "interfaceSelect", true, { dynamicOptions: { provider: "fortigate_interfaces" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
  field("sourceAddress", "Source Address", "addressObjectSelect", true, { dynamicOptions: { provider: "fortigate_address_objects" }, validation: { pattern: nameValidation.pattern, allowCustom: true } }),
  field("port", "پورت SSL VPN", "number", true, { validation: portValidation }),
];

export const policyMoveFields = [
  field("operation", "عملیات", "select", true, { options: [{ labelFa: "فعال", value: "enable", source: "existing_template" }, { labelFa: "غیرفعال", value: "disable", source: "existing_template" }, { labelFa: "جابجایی", value: "move", source: "existing_template" }], validation: { allowedValues: ["enable", "disable", "move"] } }),
  field("policyId", "شماره Policy", "number", true, { dynamicOptions: { provider: "fortigate_policies" }, validation: { min: 1 } }),
  field("direction", "جهت جابجایی", "select", false, { options: [{ labelFa: "قبل از", value: "before", source: "existing_template" }, { labelFa: "بعد از", value: "after", source: "existing_template" }], validation: { allowedValues: ["before", "after"] }, dependsOn: { operation: "move" } }),
  field("targetPolicyId", "Policy مرجع", "number", false, { validation: { min: 1 }, dependsOn: { operation: "move" } }),
];

export function unsupported(reasonFa: string) {
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

export function buildFortiGateVpnPreview(context: GuidedActionBuildContext) {
  const required = guidedVpnSteps.flatMap((step) => step.fields).filter((item) => item.required);
  const missingFields = missing(context, required.filter((item) => !item.dependsOn || Object.entries(item.dependsOn).every(([key, value]) => context.values[key] === value)));
  if (missingFields.length) return { ok: false as const, status: "needs_input" as const, reasonFa: "برای ساخت پیش‌نمایش VPN چند مقدار لازم هنوز کامل نیست.", missingFields };

  const vpnType = textValue(context, "vpnType", "ipsec_site_to_site");
  const vpnName = textValue(context, "vpnName", textValue(context, "name", `guided-${vpnType}-vpn`));
  const phase1Name = textValue(context, "phase1Name", vpnName);
  const phase2Name = textValue(context, "phase2Name", `${phase1Name}-p2`);
  const localSubnet = textValue(context, "localSubnet") || listValue(context, "localSubnets")[0] || "";
  const remoteSubnet = textValue(context, "remoteSubnet") || listValue(context, "remoteSubnets")[0] || "";
  const tunnelName = vpnName;
  const localSubnets = localSubnet ? [localSubnet] : listValue(context, "localSubnets");
  const remoteSubnets = remoteSubnet ? [remoteSubnet] : listValue(context, "remoteSubnets");
  const allowedSubnets = listValue(context, "allowedSubnets");
  const wanInterface = textValue(context, "wanInterface");
  const remoteGateway = textValue(context, "remoteGateway");
  const lanInterface = textValue(context, "lanInterface");
  const authMethod = textValue(context, "authMethod", "psk");
  const pskMode = textValue(context, "pskMode", "manual");
  const proposal = textValue(context, "proposal", "aes256-sha256");
  const dhGroup = textValue(context, "dhGroup", "14");
  const ikeVersion = textValue(context, "ikeVersion", "2");
  const createFirewallPolicy = context.values.createFirewallPolicy === true;
  const createStaticRoute = context.values.createStaticRoute !== false;
  const natTraversal = context.values.natTraversal !== false;
  const natEnabled = context.values.natEnabled === true;
  const logTraffic = context.values.logTraffic === true;
  const enableAfterCreate = context.values.enableAfterCreate !== false;

  if (vpnType === "ipsec_site_to_site" && authMethod === "psk") {
    const pskSecretRef = createEphemeralSecretRef(String(context.values.psk ?? ""), "fortigate_ipsec_psk");
    const verificationPlan = ["get vpn ipsec tunnel summary", "diagnose vpn tunnel list name <tunnel>", "show vpn ipsec phase1-interface", "show vpn ipsec phase2-interface", ...(createFirewallPolicy ? ["show firewall policy"] : [])];
    const rollbackPlan = [
      "Delete created phase2 selectors, then phase1-interface.",
      "Remove created static routes by route ID from the config snapshot when route creation was enabled.",
      "Delete managed address objects and firewall policies by generated names when policy creation was enabled.",
      "PSK material is never persisted in rollback metadata.",
    ];
    const structuredPreview = {
      summaryFa: "ActionPlan اجرایی IPsec Site-to-Site آماده شد. اجرای واقعی فقط بعد از تایید Quick Controlled و PolicyGuard انجام می‌شود.",
      fieldsFa: {
        "نوع VPN": vpnType,
        "نام تونل": vpnName,
        "Phase1": phase1Name,
        "Phase2": phase2Name,
        "WAN interface": wanInterface,
        "LAN interface": lanInterface,
        "Remote Gateway": remoteGateway,
        "شبکه محلی": localSubnet,
        "شبکه سمت مقابل": remoteSubnet,
        "Proposal": proposal,
        "DH Group": dhGroup,
        "IKE Version": ikeVersion,
        "Secret": "PSK با secretRef موقت نگهداری شده و در preview/audit نمایش داده نمی‌شود.",
        "Policy/NAT/Logging choices": {
          createFirewallPolicy: enabledLabel(createFirewallPolicy),
          createStaticRoute: enabledLabel(createStaticRoute),
          natTraversal: enabledLabel(natTraversal),
          natEnabled: enabledLabel(natEnabled),
          logTraffic: enabledLabel(logTraffic),
          enableAfterCreate: enabledLabel(enableAfterCreate),
        },
        "برنامه verification": verificationPlan,
        "برنامه rollback": rollbackPlan,
      },
      verificationPlan,
      rollbackPlan,
      supportState: "verified",
      supportReasonKey: "actions.support.verified.fortigateIpsecSiteToSite",
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
          vpnName,
          phase1Name,
          phase2Name,
          name: vpnName,
          localSubnet,
          remoteSubnet,
          localSubnets: [localSubnet],
          remoteSubnets: [remoteSubnet],
          allowedSubnets,
          wanInterface,
          lanInterface,
          remoteGateway,
          authMethod,
          pskMode,
          pskSecretRef,
          pskProvided: true,
          proposal,
          dhGroup,
          ikeVersion,
          createFirewallPolicy,
          createStaticRoute,
          natTraversal,
          natEnabled,
          logTraffic,
          enableAfterCreate,
          source: "guided_action_wizard",
          implementationState: "implemented",
          executionSupport: "connector",
          executable: true,
          supportState: "verified",
          supportReasonKey: "actions.support.verified.fortigateIpsecSiteToSite",
          connectorType: "fortigate-ssh",
          operationCategory: "vpn",
          blueprintId: context.blueprintId,
          executionTemplateRef: "fortigate_guided_vpn_setup",
          semanticResultParser: "fortigate_ipsec_site_to_site_vpn",
          precheck: ["Interface discovery compatibility", "PolicyGuard validation"],
          postVerification: verificationPlan,
          structuredPreview,
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
            executionSupport: "connector",
            implementationState: "implemented",
            executable: true,
            supportState: "verified",
            supportReasonKey: "actions.support.verified.fortigateIpsecSiteToSite",
            connectorType: "fortigate-ssh",
            executionTemplateRef: "fortigate_guided_vpn_setup",
            semanticResultParser: "fortigate_ipsec_site_to_site_vpn",
            normalizedParams: {
              vpnType,
              vpnName,
              phase1Name,
              phase2Name,
              localSubnet,
              remoteSubnet,
              allowedSubnets,
              wanInterface,
              lanInterface,
              remoteGateway,
              authMethod,
              pskMode,
              proposal,
              dhGroup,
              ikeVersion,
              createFirewallPolicy,
              createStaticRoute,
              natTraversal,
              natEnabled,
              logTraffic,
              enableAfterCreate,
            },
            requiredParamsSatisfied: true,
            previewGenerated: true,
            executed: false,
            connectorInvoked: false,
            lastExecutionStatus: "ready_for_execution",
          },
        },
      },
      preview: structuredPreview,
    };
  }
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
