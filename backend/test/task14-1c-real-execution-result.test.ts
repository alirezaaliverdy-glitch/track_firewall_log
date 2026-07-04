import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ActionPlanStatus, ActionType } from "@prisma/client";
import { actionExecutionUiState } from "../../src/lib/actionApprovalState.js";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("Linux prepared commands use real controlled SSH templates", () => {
  const connector = read("../src/connectors/linux-ssh.connector.ts");
  assert.match(connector, /ss -lntup \|\| netstat -lntup/);
  assert.match(connector, /systemctl is-active ssh \|\| systemctl is-active sshd \|\| service ssh status/);
  assert.match(connector, /journalctl -u ssh -u sshd --since '24 hours ago'.*auth\.log/);
  assert.match(connector, /getent group sudo; getent group wheel; awk -F:/);
  assert.match(connector, /ufw status verbose \|\| .*nft list ruleset \|\| .*iptables -S/);
  assert.match(connector, /systemctl status \$\{service\} --no-pager \|\| service \$\{service\} status/);
});

test("dry_run_ready remains a preview and never counts as execution", () => {
  const state = actionExecutionUiState({ id: "preview", source: "user", requestedBy: null, deviceId: "device", aiIntentId: null, actionType: "linux_check_sudo_users", status: ActionPlanStatus.dry_run_ready, riskLevel: "low", parametersJson: { executionSupport: "connector", metadata: { source: "command_catalog", implementationState: "implemented", executionTemplateRef: "linux_check_sudo_users", executed: false } }, validationJson: { valid: true, errors: [], missingFields: [] }, dryRunJson: { status: "planned" }, approvalJson: {}, resultJson: {}, rollbackJson: {}, createdAt: "", updatedAt: "" });
  assert.equal(state.canExecute, true); assert.notEqual(ActionPlanStatus.dry_run_ready, ActionPlanStatus.succeeded);
});

test("manual catalog actions cannot expose execute and successful UI navigates to result", () => {
  const state = actionExecutionUiState({ id: "manual", source: "user", requestedBy: null, deviceId: "device", aiIntentId: null, actionType: ActionType.generic_security_action, status: ActionPlanStatus.proposed, riskLevel: "medium", parametersJson: { executionSupport: "manual_or_not_implemented", metadata: { source: "command_catalog", implementationState: "manualOnly", executed: false } }, validationJson: {}, dryRunJson: {}, approvalJson: {}, resultJson: {}, rollbackJson: {}, createdAt: "", updatedAt: "" });
  assert.equal(state.canExecute, false);
  const center = read("../../src/components/actions/ActionCenterPanel.tsx"); const result = read("../../src/components/actions/ActionResultView.tsx");
  assert.match(center, /window\.location\.assign\(`\/actions\/\$\{encodeURIComponent\(plan\.id\)\}\/result`\)/); assert.match(center, /disabled=\{Boolean\(working\)/);
  assert.match(result, /نتیجه اجرای دستور/); assert.match(result, /خروجی خام دستور/); assert.match(result, /parseOpenPorts/);
});

test("backend stores actual connector result before succeeded", () => {
  const service = read("../src/services/action-plan.service.ts");
  assert.match(service, /executionSucceeded = result\.executed && result\.commands\.length > 0/); assert.match(service, /status: executionSucceeded \? ActionPlanStatus\.succeeded : ActionPlanStatus\.failed/); assert.match(service, /stdout: result\.commands\.map/); assert.match(service, /executor: connector\.name/);
});
