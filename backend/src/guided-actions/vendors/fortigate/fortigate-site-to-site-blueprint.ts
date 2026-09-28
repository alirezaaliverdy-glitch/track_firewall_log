import type { GuidedActionBlueprint } from "../../types.js";
import { buildFortiGateVpnPreview, guidedVpnSteps } from "./fortigate-vpn-blueprint.js";

// The executable catalog entry is intentionally separate from unfinished SSL/remote-access workflows.
export const fortigateSiteToSiteBlueprint: GuidedActionBlueprint = {
  id: "fortigate_ipsec_site_to_site", vendor: "fortigate", titleFa: "ساخت تونل IPsec فورتی‌گیت", descriptionFa: "اتصال دو شبکه با IKEv2؛ شبکه‌ها، رمز مشترک و قوانین عبور ترافیک را با پیش‌نمایش تنظیم کنید.",
  category: "vpn", risk: "high", actionKind: "guided_action", implementationState: "implemented", researchStatus: "verified_from_official_docs", supportedConnectors: ["fortigate-ssh"], requiredCapabilities: ["canExecuteWriteActions"],
  prerequisites: [{ id: "backup", titleFa: "بک‌آپ و مسیر مدیریت جایگزین", required: true }],
  steps: guidedVpnSteps.map(step => ({ ...step, fields: step.fields.filter(field => !["vpnPoolCidr", "allowedSubnets"].includes(field.key)).map(field => field.key === "vpnType" ? { ...field, options: [{ value: "ipsec_site_to_site", labelFa: "IPsec Site-to-Site / IKEv2" }], validation: { allowedValues: ["ipsec_site_to_site"] } } : field.key === "authMethod" ? { ...field, options: [{ value: "psk", labelFa: "کلید مشترک (PSK)" }], validation: { allowedValues: ["psk"] } } : field).map(field => ({ ...field, validation: { ...field.validation, allowExampleValue: true } })) })),
  buildActionPlan: buildFortiGateVpnPreview,
  verification: { commands: ["Read phase1/phase2, administrative state, routes/policies and SA summary separately"] },
  rollback: { available: false, automatic: false, template: "manual_review_created_objects" },
};
