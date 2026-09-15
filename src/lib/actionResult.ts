import { normalizeArray, normalizeObject, type ActionPlan } from "./actions";

export type OpenPortRow = { protocol: string; localAddress: string; port: string; process: string };

export type ActionCommandOutput = {
  label: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  state: "succeeded" | "failed" | "unknown";
};

function commandExitCode(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function actionCommandOutputs(action: ActionPlan): ActionCommandOutput[] {
  const result = normalizeObject(action.resultJson);
  const commands = normalizeArray<Record<string, unknown>>(result.commands);

  if (commands.length > 0) {
    return commands.map((command, index) => {
      const exitCode = commandExitCode(command.exitCode);
      return {
        label: String(command.template ?? command.command ?? `فرمان ${index + 1}`),
        stdout: typeof command.stdout === "string" ? command.stdout.trimEnd() : "",
        stderr: typeof command.stderr === "string" ? command.stderr.trimEnd() : "",
        exitCode,
        state: exitCode === null ? "unknown" : exitCode === 0 ? "succeeded" : "failed",
      };
    });
  }

  const stdout = typeof result.stdout === "string" ? result.stdout.trimEnd() : "";
  const stderr = typeof result.stderr === "string" ? result.stderr.trimEnd() : "";
  const exitCode = commandExitCode(result.exitCode);
  if (!stdout && !stderr && exitCode === null) return [];

  return [{
    label: "خروجی اجرای دستور",
    stdout,
    stderr,
    exitCode,
    state: exitCode === null ? "unknown" : exitCode === 0 ? "succeeded" : "failed",
  }];
}

export function actionRawOutput(action: ActionPlan) {
  const result = normalizeObject(action.resultJson);
  const direct = [result.stdout, result.stderr].filter((value) => typeof value === "string" && value).join("\n");
  if (direct) return direct;
  return normalizeArray<Record<string, unknown>>(result.commands)
    .flatMap((command) => [command.stdout, command.stderr])
    .filter((value): value is string => typeof value === "string" && Boolean(value))
    .join("\n");
}

export function parseOpenPorts(output: string): OpenPortRow[] {
  return output.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean).map((line) => {
    const fields = line.split(/\s+/);
    const protocol = fields[0] ?? "-";
    const addressIndex = protocol.startsWith("tcp") || protocol.startsWith("udp") ? (fields[1] === "LISTEN" ? 4 : 3) : 3;
    const endpoint = fields[addressIndex] ?? "";
    const match = endpoint.match(/^(.+):([^:]+)$/);
    return { protocol, localAddress: match?.[1] ?? endpoint, port: match?.[2] ?? "-", process: fields.slice(addressIndex + 2).join(" ") || "-" };
  }).filter((row) => row.localAddress);
}
