import net from "node:net";
import { ActionType, AiRiskLevel, type ActionPlan } from "@prisma/client";
import { compileRouterOsAction } from "../services/routeros-command-compiler.js";

export type MikroTikCommandSpec = {
  template: string;
  command: string;
  write: boolean;
  target: Record<string, unknown>;
  rollbackSteps: string[];
  warnings: string[];
};

export type MikroTikValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedParameters: Record<string, unknown>;
  riskLevel: AiRiskLevel;
  commandSpecs: MikroTikCommandSpec[];
  rollbackJson: Record<string, unknown>;
};

const MIKROTIK_ACTIONS = new Set<ActionType>([
  ActionType.mikrotik_add_address_list_entry,
  ActionType.mikrotik_remove_address_list_entry,
  ActionType.mikrotik_block_ip_temporary,
  ActionType.mikrotik_update_address_list_entry,
  ActionType.mikrotik_create_managed_drop_rule,
  ActionType.mikrotik_enable_managed_rule,
  ActionType.mikrotik_disable_managed_rule,
  ActionType.mikrotik_add_comment_to_rule,
  ActionType.mikrotik_read_firewall_summary,
  ActionType.mikrotik_create_filter_rule,
  ActionType.mikrotik_enable_filter_rule,
  ActionType.mikrotik_disable_filter_rule,
  ActionType.mikrotik_move_filter_rule,
  ActionType.mikrotik_set_filter_rule_comment,
  ActionType.mikrotik_remove_managed_filter_rule,
  ActionType.mikrotik_list_filter_rules,
  ActionType.mikrotik_search_filter_rules,
  ActionType.mikrotik_create_dstnat_rule,
  ActionType.mikrotik_create_srcnat_masquerade_rule,
  ActionType.mikrotik_enable_nat_rule,
  ActionType.mikrotik_disable_nat_rule,
  ActionType.mikrotik_set_nat_rule_comment,
  ActionType.mikrotik_remove_managed_nat_rule,
  ActionType.mikrotik_list_nat_rules,
  ActionType.mikrotik_unblock_ip,
  ActionType.mikrotik_list_address_list,
  ActionType.mikrotik_create_managed_blocklist_rule,
  ActionType.mikrotik_list_ip_services,
  ActionType.mikrotik_disable_unused_service,
  ActionType.mikrotik_restrict_service_by_address,
  ActionType.mikrotik_change_service_port,
  ActionType.mikrotik_enable_service,
  ActionType.mikrotik_disable_service,
  ActionType.mikrotik_list_interfaces,
  ActionType.mikrotik_enable_interface,
  ActionType.mikrotik_disable_interface,
  ActionType.mikrotik_set_interface_comment,
  ActionType.mikrotik_detect_wan_lan_candidates,
  ActionType.mikrotik_list_routes,
  ActionType.mikrotik_add_static_route,
  ActionType.mikrotik_disable_static_route,
  ActionType.mikrotik_remove_managed_static_route,
  ActionType.mikrotik_show_dns_settings,
  ActionType.mikrotik_set_dns_servers,
  ActionType.mikrotik_list_dhcp_servers,
  ActionType.mikrotik_list_dhcp_leases,
  ActionType.mikrotik_add_static_dhcp_lease,
  ActionType.mikrotik_remove_static_dhcp_lease,
  ActionType.mikrotik_create_backup,
  ActionType.mikrotik_create_export_sanitized,
  ActionType.mikrotik_set_identity,
  ActionType.mikrotik_show_clock,
  ActionType.mikrotik_show_logs,
  ActionType.mikrotik_show_resources,
  ActionType.mikrotik_reboot,
  ActionType.mikrotik_schedule_reboot,
  ActionType.mikrotik_disable_rule_by_id,
  ActionType.mikrotik_remove_rule_by_id
]);

const TASK27_ACTIONS = new Set<ActionType>([
  ActionType.mikrotik_add_address_list_entry,
  ActionType.mikrotik_remove_address_list_entry,
  ActionType.mikrotik_block_ip_temporary,
  ActionType.mikrotik_update_address_list_entry,
  ActionType.mikrotik_create_managed_drop_rule,
  ActionType.mikrotik_enable_managed_rule,
  ActionType.mikrotik_disable_managed_rule,
  ActionType.mikrotik_add_comment_to_rule,
  ActionType.mikrotik_read_firewall_summary
]);

const MANAGED_COMMENT_PREFIX = "firewall-log-analyzer";
const SAFE_NAME = /^[A-Za-z0-9_.:-]{1,64}$/;
const SAFE_RULE_ID = /^\*?[A-Fa-f0-9]{1,16}$/;
const SAFE_TIMEOUT = /^(\d+[smhdw]){1,4}$/;
const READ_SUMMARY_COMMANDS = [
  "/ip firewall filter print terse",
  "/ip firewall nat print terse",
  "/ip firewall address-list print terse",
  "/ip service print terse"
] as const;

export function isMikroTikAction(actionType: ActionType) {
  return MIKROTIK_ACTIONS.has(actionType);
}

export function mikroTikSupportedActions() {
  return Array.from(MIKROTIK_ACTIONS);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(parameters: Record<string, unknown>, key: string) {
  const value = parameters[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function quote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function safeComment(value: string | undefined, fallback = "") {
  const comment = (value ?? fallback).trim();
  return comment.length > 120 ? comment.slice(0, 120) : comment;
}

function validIpv4OrCidr(value: string | undefined) {
  if (!value) return false;
  const [ip, prefix] = value.split("/");
  if (net.isIP(ip) !== 4) return false;
  if (prefix === undefined) return true;
  const parsed = Number.parseInt(prefix, 10);
  return String(parsed) === prefix && parsed >= 0 && parsed <= 32;
}

function validateSafeName(value: string | undefined, field: string, errors: string[]) {
  if (!value) errors.push(`${field} is required.`);
  else if (!SAFE_NAME.test(value)) errors.push(`${field} may contain only letters, numbers, underscore, dot, colon, and hyphen.`);
}

function validateTimeout(value: string | undefined, errors: string[]) {
  if (value !== undefined && !SAFE_TIMEOUT.test(value)) {
    errors.push("timeout must be a RouterOS duration such as 30m, 1h, or 1d.");
  }
}

function validateRuleTarget(ruleId: string | undefined, comment: string | undefined, errors: string[]) {
  if (!ruleId && !comment) errors.push("ruleId or comment is required.");
  if (ruleId && !SAFE_RULE_ID.test(ruleId)) errors.push("ruleId is invalid.");
  if (comment && comment.length > 120) errors.push("comment must be 120 characters or fewer.");
}

function findAddressEntryScript(listName: string, address: string) {
  return `:local ids [/ip firewall address-list find where list=${quote(listName)} address=${quote(address)}]; :if ([:len $ids] = 1) do={/ip firewall address-list remove $ids} else={:error "expected exactly one address-list match"}`;
}

function addressEntryCheckCommand(listName: string, address: string) {
  return `/ip firewall address-list print terse where list=${quote(listName)} address=${quote(address)}`;
}

function updateAddressEntryCommand(listName: string, address: string, timeout: string | undefined, comment: string) {
  const timeoutPart = timeout ? ` timeout=${quote(timeout)}` : "";
  return `/ip firewall address-list set [find list=${quote(listName)} address=${quote(address)}]${timeoutPart} comment=${quote(comment)}`;
}

function managedRuleFind(ruleId: string | undefined, comment: string | undefined) {
  if (ruleId) return `.id=${quote(ruleId)} comment~${quote(`^${MANAGED_COMMENT_PREFIX}`)}`;
  return `comment=${quote(comment ?? "")} comment~${quote(`^${MANAGED_COMMENT_PREFIX}`)}`;
}

function managedRuleScript(action: "enable" | "disable", ruleId: string | undefined, comment: string | undefined) {
  const where = managedRuleFind(ruleId, comment);
  return `:local ids [/ip firewall filter find where ${where}]; :if ([:len $ids] = 1) do={/ip firewall filter ${action} $ids} else={:error "expected exactly one managed rule match"}`;
}

function addCommentScript(ruleId: string, comment: string) {
  return `:local ids [/ip firewall filter find where .id=${quote(ruleId)}]; :if ([:len $ids] = 1) do={/ip firewall filter set $ids comment=${quote(comment)}} else={:error "expected exactly one firewall rule match"}`;
}

function commandSpec(input: Omit<MikroTikCommandSpec, "write"> & { write?: boolean }): MikroTikCommandSpec {
  return { ...input, write: input.write ?? true };
}

export function validateMikroTikAction(plan: Pick<ActionPlan, "actionType" | "riskLevel"> & { parametersJson: unknown }): MikroTikValidation {
  const parameters = asObject(plan.parametersJson);
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalized: Record<string, unknown> = {};
  const commandSpecs: MikroTikCommandSpec[] = [];
  let riskLevel = plan.riskLevel;
  let rollbackJson: Record<string, unknown> = { type: "manual_review" };

  if (!MIKROTIK_ACTIONS.has(plan.actionType)) {
    return {
      valid: false,
      errors: ["Action type is not in the MikroTik catalog."],
      warnings,
      normalizedParameters: normalized,
      riskLevel,
      commandSpecs,
      rollbackJson
    };
  }

  if (Object.keys(parameters).some((key) => ["command", "cmd", "shell", "script", "exec", "args"].includes(key))) {
    errors.push("Raw command, shell, script, exec, or args parameters are not allowed.");
  }

  if (!TASK27_ACTIONS.has(plan.actionType)) {
    try {
      const compiled = compileRouterOsAction({
        actionType: plan.actionType,
        parameters,
        riskLevel: plan.riskLevel
      });
      return {
        valid: errors.length === 0,
        errors,
        warnings: errors.length > 0 ? warnings : [...warnings, ...compiled.warnings],
        normalizedParameters: compiled.normalizedParameters,
        riskLevel: compiled.riskLevel,
        commandSpecs: errors.length > 0 ? [] : compiled.commandSpecs,
        rollbackJson: compiled.rollbackJson
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "MikroTik action is invalid.";
      return {
        valid: false,
        errors: [...errors, message === "ROUTEROS_UNSUPPORTED_FEATURE" ? "ROUTEROS_UNSUPPORTED_FEATURE" : message],
        warnings,
        normalizedParameters: normalized,
        riskLevel,
        commandSpecs,
        rollbackJson
      };
    }
  }

  if (plan.actionType === ActionType.mikrotik_add_address_list_entry || plan.actionType === ActionType.mikrotik_block_ip_temporary || plan.actionType === ActionType.mikrotik_update_address_list_entry) {
    const address = text(parameters, "address") ?? text(parameters, "srcIp");
    const listName = text(parameters, "listName") ?? "ai_blocklist";
    const timeout = text(parameters, "timeout") ?? (plan.actionType === ActionType.mikrotik_block_ip_temporary ? "10m" : undefined);
    const comment = safeComment(text(parameters, "comment"), "created-by-firewall-log-analyzer");

    if (!validIpv4OrCidr(address)) errors.push("address must be a valid IPv4 address or CIDR.");
    validateSafeName(listName, "listName", errors);
    validateTimeout(timeout, errors);

    normalized.address = address;
    normalized.listName = listName;
    normalized.timeout = timeout ?? null;
    normalized.comment = comment;

    const timeoutPart = timeout ? ` timeout=${quote(timeout)}` : "";
    const blockCommand = `/ip firewall address-list add list=${quote(listName)} address=${quote(address ?? "")}${timeoutPart} comment=${quote(comment)}`;
    const addCommand = `/ip firewall address-list add list=${quote(listName)} address=${quote(address ?? "")} comment=${quote(comment)}${timeoutPart}`;
    const updateCommand = updateAddressEntryCommand(listName, address ?? "", timeout, comment);
    if (plan.actionType === ActionType.mikrotik_block_ip_temporary) {
      commandSpecs.push(
        commandSpec({
          template: "check exact address-list entry by list/address",
          command: addressEntryCheckCommand(listName, address ?? ""),
          write: false,
          target: { listName, address },
          warnings: [],
          rollbackSteps: []
        }),
        commandSpec({
          template: "if missing: /ip firewall address-list add list=<listName> address=<address> timeout=<timeout> comment=<comment>",
          command: blockCommand,
          target: { listName, address, timeout: timeout ?? null, branch: "missing" },
          warnings: [],
          rollbackSteps: [`Remove exact address-list entry where list=${listName} and address=${address}.`]
        }),
        commandSpec({
          template: "if exists: /ip firewall address-list set [find list=<listName> address=<address>] timeout=<timeout> comment=<comment>",
          command: updateCommand,
          target: { listName, address, timeout: timeout ?? null, branch: "exists" },
          warnings: [],
          rollbackSteps: ["Previous timeout/comment are not known from the execution preview; restore manually from audit/export if needed."]
        })
      );
      warnings.push("This action is idempotent. If the entry already exists, timeout/comment will be updated instead of adding a duplicate.");
      warnings.push("Blocking requires an existing firewall rule that uses this list.");
      rollbackJson = { type: "remove_or_restore_address_list_entry", listName, address };
    } else if (plan.actionType === ActionType.mikrotik_update_address_list_entry) {
      commandSpecs.push(commandSpec({
        template: "/ip firewall address-list set [find list=<listName> address=<address>] timeout=<timeout> comment=<comment>",
        command: updateCommand,
        target: { listName, address, timeout: timeout ?? null },
        warnings: ["Update requires an existing exact address-list entry."],
        rollbackSteps: ["Restore previous timeout/comment from audit/export if needed."]
      }));
      warnings.push(commandSpecs[0].warnings[0]);
      rollbackJson = { type: "restore_previous_address_list_entry_manual", listName, address };
    } else {
      commandSpecs.push(commandSpec({
        template: "/ip firewall address-list add list=<listName> address=<address> comment=<comment> timeout=<timeout>",
        command: addCommand,
        target: { listName, address, timeout: timeout ?? null },
        warnings: [],
        rollbackSteps: [`Remove exact address-list entry where list=${listName} and address=${address}.`]
      }));
      rollbackJson = { type: "remove_exact_address_list_entry", listName, address };
    }
  }

  if (plan.actionType === ActionType.mikrotik_remove_address_list_entry) {
    const address = text(parameters, "address") ?? text(parameters, "srcIp");
    const listName = text(parameters, "listName") ?? "ai_blocklist";
    if (!validIpv4OrCidr(address)) errors.push("address must be a valid IPv4 address or CIDR.");
    validateSafeName(listName, "listName", errors);
    normalized.address = address;
    normalized.listName = listName;
    commandSpecs.push(commandSpec({
      template: "find exact address-list entry by list/address, then remove only that exact entry",
      command: findAddressEntryScript(listName, address ?? ""),
      target: { listName, address },
      rollbackSteps: [`Re-add address=${address} to list=${listName} if removal was unintended.`],
      warnings: ["Removal is blocked unless exactly one address-list entry matches listName and address."]
    }));
    warnings.push(commandSpecs[0].warnings[0]);
    rollbackJson = { type: "re_add_removed_address_list_entry", listName, address };
  }

  if (plan.actionType === ActionType.mikrotik_create_managed_drop_rule) {
    const chain = text(parameters, "chain");
    const listName = text(parameters, "listName") ?? "ai_blocklist";
    const placeBefore = text(parameters, "placeBefore");
    const suffix = safeComment(text(parameters, "comment"), "managed drop");
    const comment = `${MANAGED_COMMENT_PREFIX} ${suffix}`.slice(0, 120);
    if (chain !== "input" && chain !== "forward") errors.push("chain must be input or forward.");
    validateSafeName(listName, "listName", errors);
    if (placeBefore && !SAFE_RULE_ID.test(placeBefore)) errors.push("placeBefore must be a RouterOS rule id.");
    normalized.chain = chain;
    normalized.listName = listName;
    normalized.placeBefore = placeBefore ?? null;
    normalized.comment = comment;
    if (chain === "input") {
      riskLevel = AiRiskLevel.high;
      warnings.push("input chain changes are high risk.");
    } else {
      riskLevel = riskLevel === AiRiskLevel.low ? AiRiskLevel.medium : riskLevel;
    }
    const placePart = placeBefore ? ` place-before=${quote(placeBefore)}` : "";
    commandSpecs.push(commandSpec({
      template: "/ip firewall filter add chain=<input|forward> src-address-list=<listName> action=drop comment=<managed-comment> disabled=yes",
      command: `/ip firewall filter add chain=${quote(chain ?? "")} src-address-list=${quote(listName)} action=drop comment=${quote(comment)} disabled=yes${placePart}`,
      target: { chain, listName, comment, disabled: true },
      rollbackSteps: [`Remove only the created managed rule whose comment is ${comment}.`],
      warnings: ["Managed drop rule is created disabled. A separate approved action is required to enable it."]
    }));
    warnings.push(commandSpecs[0].warnings[0]);
    rollbackJson = { type: "remove_created_managed_drop_rule", comment };
  }

  if (plan.actionType === ActionType.mikrotik_enable_managed_rule || plan.actionType === ActionType.mikrotik_disable_managed_rule) {
    const ruleId = text(parameters, "ruleId");
    const comment = text(parameters, "comment");
    validateRuleTarget(ruleId, comment, errors);
    normalized.ruleId = ruleId ?? null;
    normalized.comment = comment ?? null;
    const enable = plan.actionType === ActionType.mikrotik_enable_managed_rule;
    if (enable) {
      riskLevel = AiRiskLevel.high;
      warnings.push("Enabling a drop rule can interrupt management or forwarding traffic.");
    }
    commandSpecs.push(commandSpec({
      template: `${enable ? "enable" : "disable"} exactly one firewall-log-analyzer managed rule by ruleId/comment`,
      command: managedRuleScript(enable ? "enable" : "disable", ruleId, comment),
      target: { ruleId: ruleId ?? null, comment: comment ?? null, managedPrefix: MANAGED_COMMENT_PREFIX },
      rollbackSteps: [enable ? "Disable the same managed rule." : "Enable the same managed rule."],
      warnings: ["Command refuses to touch rules whose comment does not start with firewall-log-analyzer."]
    }));
    warnings.push(commandSpecs[0].warnings[0]);
    rollbackJson = { type: enable ? "disable_same_managed_rule" : "enable_same_managed_rule", ruleId, comment };
  }

  if (plan.actionType === ActionType.mikrotik_add_comment_to_rule) {
    const ruleId = text(parameters, "ruleId");
    const comment = safeComment(text(parameters, "comment"));
    if (!ruleId || !SAFE_RULE_ID.test(ruleId)) errors.push("ruleId is required and must be a RouterOS rule id.");
    if (!comment) errors.push("comment is required.");
    normalized.ruleId = ruleId;
    normalized.comment = comment;
    commandSpecs.push(commandSpec({
      template: "/ip firewall filter set <ruleId> comment=<comment>",
      command: addCommentScript(ruleId ?? "", comment),
      target: { ruleId, comment },
      rollbackSteps: ["Restore the previous comment manually if needed; the execution preview does not change the previous value."],
      warnings: ["This action can modify an existing non-managed rule comment only when explicitly selected and approved."]
    }));
    warnings.push(commandSpecs[0].warnings[0]);
    rollbackJson = { type: "restore_previous_comment_manual", ruleId };
  }

  if (plan.actionType === ActionType.mikrotik_read_firewall_summary) {
    riskLevel = AiRiskLevel.low;
    for (const command of READ_SUMMARY_COMMANDS) {
      commandSpecs.push(commandSpec({
        template: command,
        command,
        write: false,
        target: { summary: true },
        rollbackSteps: [],
        warnings: []
      }));
    }
    rollbackJson = { type: "none_read_only" };
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedParameters: normalized,
    riskLevel,
    commandSpecs,
    rollbackJson
  };
}
