import { LocalSsh } from "@/plugins/local-ssh";
import type { ActionPlan, DeviceDetails, ExecutionEvent, ExecutionHandle } from "../../../packages/contracts/src/index";
import type { SshExecuteOptions, SshExecutionEvent } from "@/plugins/local-ssh";

export type LocalSshExecutionRequest = {
  executionId: string;
  plan: ActionPlan;
  device: DeviceDetails;
  idempotencyKey: string;
  onEvent?: (event: ExecutionEvent) => Promise<void> | void;
};

export interface LocalSshExecutor {
  startExecution(input: LocalSshExecutionRequest): Promise<ExecutionHandle>;
  cancel(executionId: string): Promise<void>;
}

function sshOptions(input: LocalSshExecutionRequest): SshExecuteOptions {
  if (!input.device.credentialRef) throw new Error("LOCAL_CREDENTIAL_REF_REQUIRED");
  if (!input.device.trustedHostKeyRef) throw new Error("LOCAL_TRUSTED_HOST_KEY_REQUIRED");
  return {
    executionId: input.executionId,
    host: input.device.host,
    port: input.device.port,
    username: String(input.plan.parameters.username ?? "operator"),
    credentialRef: input.device.credentialRef,
    authMode: String(input.plan.parameters.authMode ?? "password") === "private_key" ? "private_key" : "password",
    trustedHostKeySha256: input.device.trustedHostKeyRef,
    connectTimeoutMs: Number(input.plan.parameters.connectTimeoutMs ?? 15000),
    commandTimeoutMs: Number(input.plan.parameters.commandTimeoutMs ?? 30000),
    legacyAlgorithmsAllowed: input.plan.parameters.legacyAlgorithmsAllowed === true,
    commands: input.plan.commandSpecs,
    maxOutputBytes: Number(input.plan.parameters.maxOutputBytes ?? 64000)
  };
}

export class NativeLocalSshExecutor implements LocalSshExecutor {
  async startExecution(input: LocalSshExecutionRequest): Promise<ExecutionHandle> {
    let listener: { remove: () => Promise<void> } | null = null;
    if (input.onEvent) {
      listener = await LocalSsh.addListener("sshExecutionEvent", async (event) => {
        if (event.executionId !== input.executionId) return;
        await input.onEvent?.(mapExecutionEvent(event));
        if (event.type === "completed" || event.type === "cancelled") {
          await listener?.remove();
          listener = null;
        }
      });
    }
    const started = await LocalSsh.execute(sshOptions(input));
    return { executionId: started.executionId, planId: input.plan.id, startedAt: started.startedAt };
  }

  async cancel(executionId: string) {
    await LocalSsh.cancel({ executionId });
  }
}

function mapExecutionEvent(event: SshExecutionEvent): ExecutionEvent {
  return {
    executionId: event.executionId,
    type: event.type,
    message: event.message ?? event.data ?? event.type,
    metadata: {
      stepId: event.stepId,
      data: event.data,
      exitCode: event.exitCode
    },
    createdAt: event.createdAt
  };
}
