import assert from "node:assert/strict";
import test from "node:test";
import { ActionType, AiRiskLevel } from "@prisma/client";

process.env.TEST_DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/firewall_log_analyzer_phase_a_test";

const {
  approvalSeparationError,
  backupPreconditionError,
  verificationEvidenceCountFrom,
} = await import("../src/services/action-plan.service.js");

test("Phase R1 approval policy denies self-approval for medium and higher writes", () => {
  const error = approvalSeparationError({
    actionType: ActionType.close_port,
    requestedBy: "user-requester-1",
    riskLevel: AiRiskLevel.medium,
  }, { approvedBy: "user-requester-1", approvedByRole: "admin" });

  assert.ok(error);
  assert.equal(error.code, "SELF_APPROVAL_DENIED");
});

test("Phase R1 approval policy requires real approver identity and admin approval for high risk", () => {
  const missingActor = approvalSeparationError({
    actionType: ActionType.close_port,
    requestedBy: "user-requester-1",
    riskLevel: AiRiskLevel.high,
  }, { approvedBy: "operator:operator", approvedByRole: "admin" });

  assert.ok(missingActor);
  assert.equal(missingActor.code, "REAL_APPROVER_REQUIRED");

  const weakRole = approvalSeparationError({
    actionType: ActionType.close_port,
    requestedBy: "user-requester-1",
    riskLevel: AiRiskLevel.high,
  }, { approvedBy: "user-admin-2", approvedByRole: "operator" });

  assert.ok(weakRole);
  assert.equal(weakRole.code, "PRIVILEGED_APPROVER_REQUIRED");
});

test("Phase R1 backup policy blocks high risk execution without completed backup outside protected lab mode", () => {
  const error = backupPreconditionError({
    riskLevel: AiRiskLevel.high,
    rollbackJson: { requiresBackup: true, backup: { state: "failed" } },
    parametersJson: {},
  }, { actionAllowLabUnrestrictedManagement: false });

  assert.ok(error);
  assert.equal(error.code, "BACKUP_REQUIRED");

  assert.equal(backupPreconditionError({
    riskLevel: AiRiskLevel.high,
    rollbackJson: { requiresBackup: true, backup: { state: "completed" } },
    parametersJson: {},
  }, { actionAllowLabUnrestrictedManagement: false }), null);
});

test("Phase R1 verification evidence count uses typed evidence instead of one-object presence", () => {
  assert.equal(verificationEvidenceCountFrom({
    verification: {
      ok: true,
      evidence: [
        { key: "command", status: "passed" },
        { key: "state", status: "passed" },
      ],
    },
  }), 2);
  assert.equal(verificationEvidenceCountFrom({ verification: { ok: true, summary: "ok" } }), 0);
});
