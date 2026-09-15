import { ActionType, AiRiskLevel } from "@prisma/client";
import { catalogEntry as e } from "./helpers.js";

export const FORTIGATE_COMMAND_CATALOG = Object.freeze([
  e("fortigate", "read_system_status", "Read system status", "system", "fortigate_read_system_status", ["show system status", "read system status", "نمایش وضعیت سیستم"], AiRiskLevel.low, true, [], [], { supported: false }),
  e("fortigate", "backup_config", "Backup configuration", "system", ActionType.fortigate_backup_config, ["backup config", "read config", "پشتیبان کانفیگ"], AiRiskLevel.low, true),
  e("fortigate", "read_interfaces", "Read interfaces", "interfaces", ActionType.fortigate_list_interfaces, ["show interfaces", "read interfaces", "نمایش اینترفیس"], AiRiskLevel.low, true),
  e("fortigate", "read_routes", "Read routes", "routing", ActionType.fortigate_list_routes, ["show routes", "read routes", "نمایش مسیرها"], AiRiskLevel.low, true),
  e("fortigate", "read_firewall_policies", "Read firewall policies", "firewall", ActionType.fortigate_list_policies, ["show firewall policies", "read policies", "نمایش policy"], AiRiskLevel.low, true),
  e("fortigate", "create_address_object", "Create address object", "objects", ActionType.fortigate_create_address_object, ["create address object", "add address object", "ساخت address object"], AiRiskLevel.low, false, ["addressObjectName"], ["sourceIp", "sourceCidr"]),
  e("fortigate", "update_address_object", "Update address object", "objects", ActionType.fortigate_update_address_object, ["update address object", "ویرایش address object"], AiRiskLevel.medium, false, ["addressObjectName"], ["sourceIp", "sourceCidr"]),
  e("fortigate", "create_address_group", "Create address group", "objects", ActionType.fortigate_create_address_group, ["create address group", "ساخت گروه آدرس"], AiRiskLevel.low, false, ["addressObjectName"]),
  e("fortigate", "create_service_object", "Create service object", "objects", ActionType.fortigate_create_service_object, ["create service object", "ساخت service object"], AiRiskLevel.low, false, ["serviceName", "port"], ["protocol"]),
  e("fortigate", "create_schedule", "Create schedule", "objects", ActionType.fortigate_create_recurring_schedule, ["create schedule", "ساخت schedule"], AiRiskLevel.low, false, ["schedule"]),
  e("fortigate", "create_firewall_policy", "Create firewall policy", "firewall", ActionType.fortigate_create_policy, ["create firewall policy", "create policy", "ساخت policy فایروال"], AiRiskLevel.high, false, ["srcInterface", "dstInterface"], ["sourceIp", "services", "schedule", "nat", "logTraffic"]),
  e("fortigate", "enable_firewall_policy", "Enable firewall policy", "firewall", ActionType.fortigate_enable_policy, ["enable firewall policy", "فعال کردن policy"], AiRiskLevel.high, false),
  e("fortigate", "disable_firewall_policy", "Disable firewall policy", "firewall", ActionType.fortigate_disable_policy, ["disable firewall policy", "غیرفعال کردن policy"], AiRiskLevel.medium, false),
  e("fortigate", "move_firewall_policy", "Move firewall policy", "firewall", ActionType.fortigate_move_policy, ["move firewall policy", "جابجایی policy"], AiRiskLevel.high, false),
  e("fortigate", "create_vip", "Create virtual IP", "nat", ActionType.fortigate_create_vip, ["create vip", "add virtual ip", "ساخت vip"], AiRiskLevel.high, false, ["name", "mappedIp", "externalPort", "mappedPort"], ["externalIp"]),
  e("fortigate", "create_port_forward", "Create port forward policy", "nat", ActionType.fortigate_create_dstnat_policy, ["create port forward", "create dstnat policy", "انتقال پورت"], AiRiskLevel.high, false),
  e("fortigate", "create_static_route", "Create static route", "routing", ActionType.fortigate_create_static_route, ["create static route", "add static route", "افزودن مسیر ثابت"], AiRiskLevel.high, false, ["destinationCidr", "gateway"], ["dstInterface"]),
  e("fortigate", "read_logs", "Read logs", "observability", ActionType.fortigate_show_logs, ["show logs", "read logs", "نمایش لاگ"], AiRiskLevel.low, true),
  e("fortigate", "read_sessions", "Read sessions", "observability", ActionType.fortigate_show_sessions, ["show sessions", "read sessions", "نمایش session"], AiRiskLevel.low, true),
  e("fortigate", "read_address_objects", "Read address objects", "objects", ActionType.fortigate_list_address_objects, ["show address objects", "read address objects", "نمایش address object"], AiRiskLevel.low, true),
  e("fortigate", "read_service_objects", "Read service objects", "objects", "fortigate_read_service_objects", ["show service objects", "read service objects", "نمایش service object"], AiRiskLevel.low, true, [], [], { supported: false }),
  e("fortigate", "read_zones", "Read zones and interfaces", "interfaces", ActionType.fortigate_list_zones, ["show zones", "read zones", "نمایش zone"], AiRiskLevel.low, true),
  e("fortigate", "read_admin_users", "Read administrator users", "system", ActionType.fortigate_list_admins, ["show admin users", "read admins", "نمایش مدیران"], AiRiskLevel.low, true)
  ,e("fortigate", "read_vips", "Read virtual IPs", "nat", "fortigate_read_vips", ["show vips", "read virtual ips", "نمایش vip ها"], AiRiskLevel.low, true, [], [], { supportsExecution: false })
  ,e("fortigate", "enable_policy_logging", "Enable firewall policy logging", "firewall", ActionType.fortigate_update_policy, ["enable policy logging", "set logtraffic all", "فعال کردن لاگ policy"], AiRiskLevel.medium, false, ["policyId"], [], { safetyNotes: ["Only an explicitly selected managed policy may be updated."] })
  ,e("fortigate", "attach_security_profile", "Attach existing security profile", "security profiles", "fortigate_attach_security_profile", ["attach security profile", "apply existing profile", "اتصال پروفایل امنیتی موجود"], AiRiskLevel.high, false, ["policyId", "profileName"], ["profileType"], { supportsExecution: false })
]);
