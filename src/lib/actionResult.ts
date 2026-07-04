import { normalizeArray, normalizeObject, type ActionPlan } from "./actions";

export type OpenPortRow = { protocol: string; localAddress: string; port: string; process: string };

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
