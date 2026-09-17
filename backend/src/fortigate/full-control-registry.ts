export type FortiGateControlAction = {
  actionType: string;
  titleFa: string;
  category: string;
  risk: "low" | "medium" | "high" | "critical";
  readCommand: string;
  createTemplate?: string;
  updateTemplate?: string;
  deleteTemplate?: string;
  enableTemplate?: string;
  disableTemplate?: string;
  requiredParams: string[];
  preChecks: string[];
  previewDiff: string;
  executionTemplateRef: string;
  verificationCommands: string[];
  rollbackTemplate: string;
  parser: string;
  uiHints: Record<string, unknown>;
};

const read = (
  actionType: string,
  titleFa: string,
  category: string,
  readCommand: string,
  parser: string,
): FortiGateControlAction => ({
  actionType,
  titleFa,
  category,
  risk: "low",
  readCommand,
  requiredParams: [],
  preChecks: ["device_selected", "fortigate_ssh_ready"],
  previewDiff: "read_only_evidence_preview",
  executionTemplateRef: actionType,
  verificationCommands: [readCommand],
  rollbackTemplate: "none_read_only",
  parser,
  uiHints: { result: "evidence_table", rawOutputCollapsed: true },
});

const write = (
  actionType: string,
  titleFa: string,
  category: string,
  risk: FortiGateControlAction["risk"],
  requiredParams: string[],
  template: Partial<Pick<FortiGateControlAction, "createTemplate" | "updateTemplate" | "deleteTemplate" | "enableTemplate" | "disableTemplate">>,
  verificationCommands: string[],
): FortiGateControlAction => ({
  actionType,
  titleFa,
  category,
  risk,
  readCommand: verificationCommands[0] ?? "show",
  ...template,
  requiredParams,
  preChecks: ["device_selected", "fortigate_ssh_ready", "config_snapshot", "dependency_check"],
  previewDiff: "fortigate_cli_before_after_diff",
  executionTemplateRef: actionType,
  verificationCommands,
  rollbackTemplate: "snapshot_backed_manual_rollback",
  parser: "fortigate_control_result_parser",
  uiHints: { showDiff: true, showExecutedCliCollapsed: true, showRollbackHint: true, language: "fa" },
});

export const FORTIGATE_FULL_CONTROL_REGISTRY: readonly FortiGateControlAction[] = Object.freeze([
  read("fortigate_show_interfaces", "نمایش اینترفیس‌ها", "interface", "show system interface", "interfaces"),
  write("fortigate_create_vlan_interface", "ساخت VLAN Interface", "interface", "high", ["name", "parent", "vlanId"], { createTemplate: "config system interface/edit <name>/set type vlan" }, ["show system interface"]),
  write("fortigate_update_interface_ip", "تغییر IP اینترفیس", "interface", "high", ["name", "ip"], { updateTemplate: "config system interface/edit <name>/set ip" }, ["show system interface"]),
  write("fortigate_update_interface_allowaccess", "تغییر دسترسی مدیریتی اینترفیس", "interface", "high", ["name", "allowaccess"], { updateTemplate: "config system interface/edit <name>/set allowaccess" }, ["show system interface"]),
  write("fortigate_enable_interface", "فعال کردن اینترفیس", "interface", "high", ["name"], { enableTemplate: "config system interface/edit <name>/set status up" }, ["show system interface"]),
  write("fortigate_disable_interface", "غیرفعال کردن اینترفیس", "interface", "critical", ["name"], { disableTemplate: "config system interface/edit <name>/set status down" }, ["show system interface"]),
  write("fortigate_delete_interface", "حذف اینترفیس", "interface", "high", ["name"], { deleteTemplate: "config system interface/delete <name>" }, ["show system interface"]),

  read("fortigate_show_zones", "نمایش Zoneها", "zone", "show system zone", "zones"),
  write("fortigate_create_zone", "ساخت Zone", "zone", "high", ["name"], { createTemplate: "config system zone/edit <name>" }, ["show system zone"]),
  write("fortigate_update_zone", "به‌روزرسانی Zone", "zone", "high", ["name"], { updateTemplate: "config system zone/edit <name>" }, ["show system zone"]),
  write("fortigate_add_interface_to_zone", "افزودن اینترفیس به Zone", "zone", "high", ["name", "interfaceName"], { updateTemplate: "config system zone/edit <name>/append interface" }, ["show system zone", "show firewall policy"]),
  write("fortigate_remove_interface_from_zone", "حذف اینترفیس از Zone", "zone", "high", ["name", "interfaceName"], { updateTemplate: "config system zone/edit <name>/unselect interface" }, ["show system zone", "show firewall policy"]),
  write("fortigate_delete_zone", "حذف Zone", "zone", "high", ["name"], { deleteTemplate: "config system zone/delete <name>" }, ["show system zone", "show firewall policy"]),

  read("fortigate_show_address_objects", "نمایش Address Objectها", "object", "show firewall address", "address_objects"),
  write("fortigate_create_address_object", "ساخت Address Object", "object", "medium", ["name", "cidr"], { createTemplate: "config firewall address/edit <name>" }, ["show firewall address", "show firewall policy"]),
  write("fortigate_update_address_object", "به‌روزرسانی Address Object", "object", "medium", ["name"], { updateTemplate: "config firewall address/edit <name>" }, ["show firewall address", "show firewall policy"]),
  write("fortigate_delete_address_object", "حذف Address Object", "object", "medium", ["name"], { deleteTemplate: "config firewall address/delete <name>" }, ["show firewall address", "show firewall policy"]),
  write("fortigate_create_service_object", "ساخت Service Object", "object", "medium", ["name", "protocol", "port"], { createTemplate: "config firewall service custom/edit <name>" }, ["show firewall service custom", "show firewall policy"]),
  write("fortigate_update_service_object", "به‌روزرسانی Service Object", "object", "medium", ["name"], { updateTemplate: "config firewall service custom/edit <name>" }, ["show firewall service custom", "show firewall policy"]),
  write("fortigate_delete_service_object", "حذف Service Object", "object", "medium", ["name"], { deleteTemplate: "config firewall service custom/delete <name>" }, ["show firewall service custom", "show firewall policy"]),

  read("fortigate_show_firewall_policies", "نمایش Policyها", "policy", "show firewall policy", "policies"),
  write("fortigate_create_policy", "ساخت Policy", "policy", "high", ["srcintf", "dstintf", "srcaddr", "dstaddr", "services"], { createTemplate: "config firewall policy/edit 0" }, ["show firewall policy"]),
  write("fortigate_update_policy", "به‌روزرسانی Policy", "policy", "high", ["policyId"], { updateTemplate: "config firewall policy/edit <policyId>" }, ["show firewall policy"]),
  write("fortigate_enable_policy", "فعال کردن Policy", "policy", "high", ["policyId"], { enableTemplate: "config firewall policy/edit <policyId>/set status enable" }, ["show firewall policy"]),
  write("fortigate_disable_policy", "غیرفعال کردن Policy", "policy", "medium", ["policyId"], { disableTemplate: "config firewall policy/edit <policyId>/set status disable" }, ["show firewall policy"]),
  write("fortigate_delete_policy", "حذف Policy", "policy", "high", ["policyId"], { deleteTemplate: "config firewall policy/delete <policyId>" }, ["show firewall policy"]),
  write("fortigate_move_policy", "جابجایی Policy", "policy", "high", ["policyId"], { updateTemplate: "move <policyId> before|after <policyId>" }, ["show firewall policy"]),

  read("fortigate_show_vips", "نمایش VIPها", "nat", "show firewall vip", "vips"),
  write("fortigate_create_vip", "ساخت VIP", "nat", "high", ["name", "externalIp", "mappedIp", "externalPort", "mappedPort"], { createTemplate: "config firewall vip/edit <name>" }, ["show firewall vip", "show firewall policy"]),
  write("fortigate_update_vip", "به‌روزرسانی VIP", "nat", "high", ["name"], { updateTemplate: "config firewall vip/edit <name>" }, ["show firewall vip", "show firewall policy"]),
  write("fortigate_delete_vip", "حذف VIP", "nat", "high", ["name"], { deleteTemplate: "config firewall vip/delete <name>" }, ["show firewall vip", "show firewall policy"]),
  read("fortigate_show_ippools", "نمایش IP Poolها", "nat", "show firewall ippool", "ippools"),
  write("fortigate_create_ippool", "ساخت IP Pool", "nat", "high", ["name", "startIp", "endIp"], { createTemplate: "config firewall ippool/edit <name>" }, ["show firewall ippool", "show firewall policy"]),
  write("fortigate_update_ippool", "به‌روزرسانی IP Pool", "nat", "high", ["name"], { updateTemplate: "config firewall ippool/edit <name>" }, ["show firewall ippool", "show firewall policy"]),
  write("fortigate_delete_ippool", "حذف IP Pool", "nat", "high", ["name"], { deleteTemplate: "config firewall ippool/delete <name>" }, ["show firewall ippool", "show firewall policy"]),

  read("fortigate_show_routes", "نمایش Routeها", "routing", "get router info routing-table all", "routes"),
  write("fortigate_create_static_route", "ساخت Static Route", "routing", "high", ["destinationCidr", "gateway"], { createTemplate: "config router static/edit 0" }, ["get router info routing-table all"]),
  write("fortigate_update_static_route", "به‌روزرسانی Static Route", "routing", "high", ["routeId", "gateway"], { updateTemplate: "config router static/edit <routeId>" }, ["get router info routing-table all"]),
  write("fortigate_delete_static_route", "حذف Static Route", "routing", "high", ["routeId"], { deleteTemplate: "config router static/delete <routeId>" }, ["get router info routing-table all"]),
  write("fortigate_update_dns", "تغییر DNS", "routing", "medium", ["primary", "secondary"], { updateTemplate: "config system dns/set primary/secondary" }, ["get system dns", "show system dns"]),
  write("fortigate_update_ntp", "تنظیم NTP", "routing", "medium", ["server"], { updateTemplate: "config system ntp" }, ["show system ntp"]),

  read("fortigate_show_ipsec_vpns", "نمایش IPsec VPN", "vpn", "get vpn ipsec tunnel summary", "ipsec"),
  write("fortigate_create_ipsec_tunnel", "ساخت IPsec Tunnel", "vpn", "high", ["name", "remoteGateway", "pskSecretRef"], { createTemplate: "config vpn ipsec phase1-interface/edit <name>" }, ["show vpn ipsec phase1-interface", "show vpn ipsec phase2-interface", "get vpn ipsec tunnel summary"]),
  write("fortigate_update_ipsec_phase1", "به‌روزرسانی IPsec Phase1", "vpn", "high", ["name"], { updateTemplate: "config vpn ipsec phase1-interface/edit <name>" }, ["show vpn ipsec phase1-interface", "get vpn ipsec tunnel summary"]),
  write("fortigate_update_ipsec_phase2", "به‌روزرسانی IPsec Phase2", "vpn", "high", ["name"], { updateTemplate: "config vpn ipsec phase2-interface/edit <name>" }, ["show vpn ipsec phase2-interface", "get vpn ipsec tunnel summary"]),
  write("fortigate_disable_ipsec_tunnel", "غیرفعال کردن IPsec", "vpn", "high", ["name"], { disableTemplate: "config vpn ipsec phase1-interface/edit <name>/set status disable" }, ["show vpn ipsec phase1-interface"]),
  write("fortigate_delete_ipsec_tunnel", "حذف IPsec", "vpn", "high", ["name"], { deleteTemplate: "config vpn ipsec phase1-interface/delete <name>" }, ["show vpn ipsec phase1-interface", "show vpn ipsec phase2-interface"]),
  read("fortigate_show_ssl_vpn", "نمایش SSL VPN", "vpn", "show vpn ssl settings", "ssl_vpn"),
  write("fortigate_create_ssl_vpn_portal", "ساخت SSL VPN Portal", "vpn", "high", ["name"], { createTemplate: "config vpn ssl web portal/edit <name>" }, ["show vpn ssl web portal"]),
  write("fortigate_update_ssl_vpn_settings", "تنظیم SSL VPN", "vpn", "critical", ["port"], { updateTemplate: "config vpn ssl settings" }, ["show vpn ssl settings"]),
  write("fortigate_bind_ssl_vpn_user_group", "اتصال گروه به SSL VPN", "vpn", "high", ["groupName", "portal"], { updateTemplate: "config vpn ssl settings/authentication-rule" }, ["show vpn ssl settings"]),
  write("fortigate_disable_ssl_vpn", "غیرفعال کردن SSL VPN", "vpn", "high", [], { disableTemplate: "config vpn ssl settings/unset source-interface" }, ["show vpn ssl settings"]),

  read("fortigate_show_admins", "نمایش مدیران", "admin", "show system admin", "admins"),
  write("fortigate_create_admin", "ساخت ادمین", "admin", "critical", ["name", "profile"], { createTemplate: "config system admin/edit <name>" }, ["show system admin"]),
  write("fortigate_update_admin_trusthost", "تغییر Trusthost ادمین", "admin", "high", ["admin", "trusthost"], { updateTemplate: "config system admin/edit <admin>/set trusthost" }, ["show system admin"]),
  write("fortigate_disable_admin", "غیرفعال کردن ادمین", "admin", "critical", ["admin"], { disableTemplate: "config system admin/edit <admin>/set status disable" }, ["show system admin"]),
  write("fortigate_delete_admin", "حذف ادمین", "admin", "critical", ["admin"], { deleteTemplate: "config system admin/delete <admin>" }, ["show system admin"]),
  write("fortigate_create_api_user", "ساخت API User", "admin", "critical", ["name", "profile"], { createTemplate: "config system api-user/edit <name>" }, ["show system api-user"]),
  write("fortigate_update_management_access", "تغییر Management Access", "admin", "high", ["name", "allowaccess"], { updateTemplate: "config system interface/edit <name>/set allowaccess" }, ["show system interface"]),

  read("fortigate_show_vdoms", "نمایش VDOMها", "vdom", "show system vdom", "vdoms"),
  write("fortigate_create_vdom", "ساخت VDOM", "vdom", "critical", ["name"], { createTemplate: "config vdom/edit <name>" }, ["show system vdom"]),
  write("fortigate_update_vdom", "به‌روزرسانی VDOM", "vdom", "critical", ["name"], { updateTemplate: "config vdom/edit <name>" }, ["show system vdom"]),
  write("fortigate_move_interface_to_vdom", "انتقال اینترفیس به VDOM", "vdom", "critical", ["name", "vdom"], { updateTemplate: "config global/config system interface/edit <name>/set vdom" }, ["show system interface", "show system vdom"]),
  write("fortigate_delete_vdom", "حذف VDOM", "vdom", "critical", ["name"], { deleteTemplate: "config vdom/delete <name>" }, ["show system vdom"]),

  read("fortigate_show_ha_status", "نمایش HA", "ha", "get system ha status", "ha"),
  read("fortigate_ha_precheck", "پیش‌بررسی HA", "ha", "get system ha status", "ha"),
  write("fortigate_configure_ha", "تنظیم HA", "ha", "critical", ["mode", "groupName"], { updateTemplate: "config system ha" }, ["get system ha status", "show system ha"]),
  write("fortigate_update_ha_priority", "تغییر Priority HA", "ha", "critical", ["priority"], { updateTemplate: "config system ha/set priority" }, ["get system ha status", "show system ha"]),
  read("fortigate_show_sdwan_status", "نمایش SD-WAN", "sdwan", "show system sdwan", "sdwan"),
  write("fortigate_create_sdwan_zone", "ساخت SD-WAN Zone", "sdwan", "high", ["name"], { createTemplate: "config system sdwan/config zone/edit <name>" }, ["show system sdwan"]),
  write("fortigate_add_sdwan_member", "افزودن عضو SD-WAN", "sdwan", "high", ["interfaceName"], { updateTemplate: "config system sdwan/config members/edit 0" }, ["show system sdwan"]),
  write("fortigate_create_sdwan_health_check", "ساخت Health Check", "sdwan", "high", ["name", "server"], { createTemplate: "config system sdwan/config health-check/edit <name>" }, ["show system sdwan"]),
  write("fortigate_create_sdwan_rule", "ساخت SD-WAN Rule", "sdwan", "high", ["name"], { createTemplate: "config system sdwan/config service/edit 0" }, ["show system sdwan"]),
]);

export const FORTIGATE_FULL_CONTROL_ACTION_TYPES = FORTIGATE_FULL_CONTROL_REGISTRY.map((item) => item.actionType);

export function getFortiGateControlAction(actionType: string) {
  return FORTIGATE_FULL_CONTROL_REGISTRY.find((item) => item.actionType === actionType) ?? null;
}
