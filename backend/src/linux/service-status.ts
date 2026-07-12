export type LinuxServiceState = "active" | "inactive" | "failed" | "not_found" | "unknown";

export type LinuxServiceStatusResult = {
  serviceName: string;
  state: LinuxServiceState;
  confidence: number;
  explanation: string;
  systemctlAvailable: boolean;
  sysvAvailable: boolean;
  pgrepUsed: boolean;
  fields: Record<string, string>;
  isActive?: string;
  isEnabled?: string;
  rawEvidence: string;
};

export function validateLinuxServiceName(value: unknown) {
  const service = typeof value === "string" && value.trim() ? value.trim() : "nginx";
  if (!/^[a-zA-Z0-9_.@:-]+$/.test(service)) {
    throw new Error("Service name may contain only letters, numbers, dot, underscore, @, colon, or dash.");
  }
  return service;
}

export function buildLinuxServiceStatusCommand(service: string) {
  return [
    "if command -v systemctl >/dev/null 2>&1; then",
    `printf '__FLA_SYSTEMCTL__\\n'; systemctl show ${service} --no-pager --property=Id,LoadState,ActiveState,SubState,UnitFileState,Description,MainPID,ExecMainStatus 2>&1 || true;`,
    `printf '__FLA_IS_ACTIVE__\\n'; systemctl is-active ${service} 2>&1 || true;`,
    `printf '__FLA_IS_ENABLED__\\n'; systemctl is-enabled ${service} 2>&1 || true;`,
    "elif command -v service >/dev/null 2>&1; then",
    `printf '__FLA_SYSV__\\n'; service ${service} status 2>&1 || true;`,
    "else",
    `printf '__FLA_PGREP__\\n'; pgrep -a ${service} 2>&1 || true;`,
    "fi"
  ].join(" ");
}

function section(output: string, marker: string) {
  const start = output.indexOf(marker);
  if (start < 0) return "";
  const rest = output.slice(start + marker.length);
  const next = rest.search(/\n__FLA_[A-Z_]+__\n?/);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function fieldsFromShow(show: string) {
  const fields: Record<string, string> = {};
  for (const line of show.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9]+)=(.*)$/);
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

export function parseLinuxServiceStatus(serviceName: string, stdout: string, stderr = ""): LinuxServiceStatusResult {
  const rawEvidence = [stdout, stderr].filter(Boolean).join("\n").trim();
  const show = section(rawEvidence, "__FLA_SYSTEMCTL__");
  const sysv = section(rawEvidence, "__FLA_SYSV__");
  const pgrep = section(rawEvidence, "__FLA_PGREP__");
  const isActive = section(rawEvidence, "__FLA_IS_ACTIVE__").split(/\r?\n/)[0]?.trim();
  const isEnabled = section(rawEvidence, "__FLA_IS_ENABLED__").split(/\r?\n/)[0]?.trim();
  const fields = fieldsFromShow(show);
  let state: LinuxServiceState = "unknown";
  let confidence = 0.45;
  let explanation = "Service state could not be determined from the available command output.";

  if (show) {
    confidence = 0.95;
    const load = fields.LoadState?.toLowerCase();
    const active = fields.ActiveState?.toLowerCase();
    if (load === "not-found" || /could not be found|not-found|not found/i.test(rawEvidence)) {
      state = "not_found";
      explanation = "systemd reported that the unit is not loaded or not found.";
    } else if (active === "active" || isActive === "active") {
      state = "active";
      explanation = "systemd reports ActiveState=active.";
    } else if (active === "failed" || isActive === "failed") {
      state = "failed";
      explanation = "systemd reports the service is failed.";
    } else if (active === "inactive" || isActive === "inactive") {
      state = "inactive";
      explanation = "systemd reports the service is inactive.";
    } else if (isActive === "unknown") {
      state = "unknown";
      explanation = "systemd was available but returned an unknown state.";
    }
  } else if (sysv) {
    confidence = 0.7;
    if (/unrecognized service|not-found|not found|no such/i.test(sysv)) {
      state = "not_found";
      explanation = "SysV service fallback reported that the service was not found.";
    } else if (/\bstopped\b|not running|inactive|dead/i.test(sysv)) {
      state = "inactive";
      explanation = "SysV service fallback reported a stopped or inactive service.";
    } else if (/\bis running\b|start\/running|running\b/i.test(sysv)) {
      state = "active";
      explanation = "SysV service fallback reported a running service.";
    } else if (/failed|error/i.test(sysv)) {
      state = "failed";
      explanation = "SysV service fallback reported a failure.";
    }
  } else if (pgrep) {
    confidence = 0.45;
    state = pgrep ? "active" : "unknown";
    explanation = "Only weak pgrep evidence was available because systemctl and service were unavailable.";
  }

  return {
    serviceName,
    state,
    confidence,
    explanation,
    systemctlAvailable: Boolean(show),
    sysvAvailable: Boolean(sysv),
    pgrepUsed: Boolean(pgrep),
    fields,
    ...(isActive ? { isActive } : {}),
    ...(isEnabled ? { isEnabled } : {}),
    rawEvidence
  };
}
