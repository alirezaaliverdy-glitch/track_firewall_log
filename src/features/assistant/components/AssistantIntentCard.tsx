import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import {
  completeAiActionRequest,
  normalizeArray,
  normalizeObject,
  type AiActionDebug,
  type AiActionIntent,
} from "@/lib/ai";
import { publishActionPlanCreated, reviewInActionCenter } from "@/lib/actionPlanHandoff";
import { listDevices, type Device } from "@/lib/devices";
import { normalizedVendor, riskClass } from "../assistantUiHelpers";

export function IntentCard({
  intent,
  debug,
  createdPlanId,
  onCompleted,
  isFa,
}: {
  intent: AiActionIntent | null;
  debug: AiActionDebug | null;
  createdPlanId: string | null;
  onCompleted: (input: { actionPlanId: string | null; intent: AiActionIntent | null; message: string }) => void;
  isFa: boolean;
}) {
  const [missingValues, setMissingValues] = useState<Record<string, string>>({});
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const params = normalizeObject(intent?.parametersJson);
  const rawMissingFields = debug?.missingFields.length ? debug.missingFields : normalizeArray<unknown>(params.missingFields).map(String);
  const missingFields = rawMissingFields.filter((field) => field !== "deviceId");
  const needsDevice = !debug?.deviceId && !intent?.deviceId && !createdPlanId;
  const clarificationQuestions = normalizeArray<unknown>(params.clarificationQuestions).map(String);
  const canCreatePlan = Boolean(debug?.canCreateActionPlan);
  const riskLevel = intent?.riskLevel ?? "medium";
  const sshPortChange = intent?.intentType === "mikrotik_change_service_port" && params.service === "ssh";
  const intentType = String(intent?.intentType ?? debug?.intentType ?? "");
  const vendor = normalizedVendor(debug?.vendor ?? params.vendor ?? params.targetDeviceHint, intentType);
  const compatibleDevices = devices.filter((device) => {
    if (vendor === "mikrotik") return device.type === "mikrotik";
    if (vendor === "fortigate") return device.type === "fortigate";
    if (vendor === "linux_edge") return device.type === "linux_edge";
    if (intentType.startsWith("mikrotik_")) return device.type === "mikrotik";
    if (intentType.startsWith("fortigate_")) return device.type === "fortigate";
    if (intentType.startsWith("linux_")) return device.type === "linux_edge";
    return true;
  });
  const targetDevice = devices.find((device) => device.id === (intent?.deviceId ?? debug?.deviceId ?? selectedDeviceId));

  useEffect(() => {
    listDevices()
      .then((nextDevices) => setDevices(nextDevices))
      .catch(() => setDevices([]));
  }, [intent?.id]);

  useEffect(() => {
    if (selectedDeviceId || compatibleDevices.length !== 1) return;
    setSelectedDeviceId(compatibleDevices[0].id);
  }, [compatibleDevices, selectedDeviceId]);

  if (!intent && !debug) return null;

  const completeRequest = () => {
    if (!intent?.id) return;
    const fields: Record<string, unknown> = { ...params };
    if (selectedDeviceId) fields.deviceId = selectedDeviceId;
    for (const [key, value] of Object.entries(missingValues)) {
      if (value.trim()) fields[key] = value.trim();
    }
    if (needsDevice && !fields.deviceId) {
      setLocalMessage("Select a device first.");
      return;
    }
    const stillMissing = missingFields.filter((field) => !String(fields[field] ?? "").trim());
    if (stillMissing.length > 0) {
      setLocalMessage(`Fill missing fields: ${stillMissing.join(", ")}`);
      return;
    }
    setSubmitting(true);
    setLocalMessage(null);
    completeAiActionRequest(intent.id, fields)
      .then((result) => {
        onCompleted({
          actionPlanId: result.actionPlanId,
          intent: result.intent,
          message: result.actionPlanId ? "ActionPlan created. Review in Action Center." : result.blockedReason ?? "ActionPlan not created."
        });
        if (result.actionPlanId) {
          publishActionPlanCreated(result.actionPlanId);
        }
      })
      .catch((error: unknown) => setLocalMessage(error instanceof Error ? error.message : "Failed to complete action request."))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="mt-3 rounded-lg border border-yellow-800/70 bg-yellow-950/20 p-3 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <TriangleAlert className="h-4 w-4 text-yellow-300" aria-hidden="true" />
        <span className="text-sm font-semibold text-yellow-100">{createdPlanId ? "ActionPlan proposed" : "Action request reviewed"}</span>
        <span className={`rounded border px-2 py-0.5 text-xs ${riskClass(riskLevel)}`}>{riskLevel}</span>
        <span className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-300">{intent?.status ?? "not_supported_yet"}</span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-zinc-300">
        <p><span className="text-zinc-500">intentType:</span> {debug?.intentType ?? intent?.intentType ?? "none"}</p>
        <p><span className="text-zinc-500">vendor:</span> {vendor ?? "not selected"}</p>
        <p><span className="text-zinc-500">deviceId:</span> {debug?.deviceId ?? intent?.deviceId ?? "missing"}</p>
        <p><span className="text-zinc-500">canCreateActionPlan:</span> {String(canCreatePlan)}</p>
        {createdPlanId && <p><span className="text-zinc-500">actionPlanId:</span> {createdPlanId}</p>}
      </div>
      <div className="mt-3 rounded border border-zinc-800 bg-black/20 p-2 text-xs text-zinc-300">
        <p className="font-semibold text-zinc-200">Planned action summary</p>
        <p className="mt-1">actionType: {sshPortChange ? "Change MikroTik SSH port" : intent?.intentType ?? debug?.intentType ?? "unknown"}</p>
        <p>risk: {riskLevel}</p>
        {sshPortChange && <p>target device: {targetDevice?.name ?? intent?.deviceId ?? "select a MikroTik device"}</p>}
        {sshPortChange && <p>new port: {String(params.newPort ?? "missing")}</p>}
        {sshPortChange && <p>trusted source: {String(params.trustedSourceIp ?? params.trustedSourceCidr ?? params.trustedSource ?? "required")}</p>}
        <pre className="mt-2 max-h-32 overflow-auto rounded bg-black/30 p-2">{JSON.stringify(params, null, 2)}</pre>
      </div>
      {sshPortChange && (
        <p className="mt-2 rounded border border-red-900/70 bg-red-950/20 p-2 text-xs font-medium text-red-200">
          Lockout warning: the trusted-source firewall rule must be reviewed before the SSH service port changes.
        </p>
      )}
      {!canCreatePlan && (
        <p className="mt-2 text-xs text-yellow-200">blockedReason: {debug?.blockedReason ?? debug?.reason ?? "blocked"}</p>
      )}
      <p className="mt-2 text-xs text-zinc-400">{intent?.explanation || "No explanation provided."}</p>
      {(needsDevice || missingFields.length > 0) && (
        <div className="mt-3 rounded border border-yellow-800/70 bg-yellow-950/20 p-2">
          <p className="text-xs font-semibold text-yellow-100">Missing fields</p>
          <p className="mt-1 text-xs text-yellow-100/80">{[...(needsDevice ? ["device"] : []), ...missingFields].join(", ")}</p>
          <div className="mt-2 grid gap-2">
            {needsDevice && (
              compatibleDevices.length === 0 ? (
                <p className="rounded border border-red-900/60 bg-red-950/20 p-2 text-xs text-red-200">
                  No device found. Add one in Device Registry.
                </p>
              ) : (
                <select
                  value={selectedDeviceId}
                  onChange={(event) => setSelectedDeviceId(event.target.value)}
                  className="h-9 rounded border border-yellow-900/60 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none"
                >
                  <option value="">Select device</option>
                  {(["mikrotik", "fortigate", "linux_edge"] as const).map((type) => {
                    const group = compatibleDevices.filter((device) => device.type === type);
                    if (group.length === 0) return null;
                    return (
                      <optgroup key={type} label={type === "linux_edge" ? "Linux" : type === "mikrotik" ? "MikroTik" : "FortiGate"}>
                        {group.map((device) => (
                          <option key={device.id} value={device.id}>
                            {device.name} - {device.host}:{device.managementPort} - {device.vendor}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              )
            )}
            {missingFields.map((field) => (
              <input
                key={field}
                value={missingValues[field] ?? ""}
                onChange={(event) => setMissingValues((current) => ({ ...current, [field]: event.target.value }))}
                placeholder={field === "trustedSourceIp" ? "trustedSourceIp or trustedSourceCidr" : field}
                className="h-8 rounded border border-yellow-900/60 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none"
              />
            ))}
            <button
              type="button"
              onClick={completeRequest}
              className="h-8 rounded border border-yellow-700 bg-yellow-950/40 px-2 text-xs font-semibold text-yellow-100 disabled:opacity-50"
              disabled={submitting || (needsDevice && compatibleDevices.length === 0)}
            >
              {submitting ? (isFa ? "در حال ساخت..." : "Creating...") : (isFa ? "ساخت برنامه اقدام" : "Create ActionPlan")}
            </button>
          </div>
        </div>
      )}
      {clarificationQuestions.length > 0 && (
        <div className="mt-3 rounded border border-blue-900/70 bg-blue-950/20 p-2">
          <p className="text-xs font-semibold text-blue-100">{isFa ? "پرسش‌های تکمیلی" : "Clarification questions"}</p>
          <ul className="mt-1 space-y-1 text-xs text-blue-100/80">
            {clarificationQuestions.map((question) => <li key={question}>- {question}</li>)}
          </ul>
        </div>
      )}
      {createdPlanId && (
        <div className="mt-3 rounded border border-green-900/70 bg-green-950/20 p-3">
          <p className="text-xs font-medium text-green-200">{isFa ? "برنامه اقدام ساخته شد؛ آن را در مرکز اقدام بازبینی کنید." : "ActionPlan created. Review in Action Center."}</p>
          <button
            type="button"
            onClick={() => reviewInActionCenter(createdPlanId)}
            className="mt-2 inline-flex h-8 items-center rounded-md border border-green-800 bg-green-950/30 px-3 text-xs font-semibold text-green-200 hover:text-green-100"
          >
            {isFa ? "بازبینی در مرکز اقدام" : "Review in Action Center"}
          </button>
        </div>
      )}
      {localMessage && <p className="mt-2 text-xs text-zinc-300">{localMessage}</p>}
    </div>
  );
}
