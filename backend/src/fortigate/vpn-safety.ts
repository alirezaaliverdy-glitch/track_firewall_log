export function redactFortiVpnOutput(text: string, secret?: string) {
  const scrubbed = secret ? text.split(secret).join("[secret]") : text;
  return scrubbed.replace(/^(\s*set\s+(?:psksecret|password|passwd|private-key)\s+).*$/gim, "$1[secret]");
}

// Scope checks to a single CLI entry: another tunnel/policy must not satisfy verification.
export function fortiEntry(config: string, name: string, byPolicyName = false) {
  return [...config.matchAll(/^\s*edit\s+[^\r\n]+\r?\n[\s\S]*?^\s*next\s*$/gm)].map(row => row[0]).find(row => byPolicyName ? row.split(/\r?\n/).some(line => line.trim() === `set name "${name}"`) : row.split(/\r?\n/)[0].trim() === `edit "${name}"`) ?? "";
}

export function assertFortiVpnCreateOnly(parameters: Record<string, unknown>, configs: { phase1: string; phase2: string; interfaces: string; addresses: string; policies: string }, targets: Array<Record<string, unknown>>) {
  const phase1 = String(parameters.phase1Name), phase2 = String(parameters.phase2Name);
  if (fortiEntry(configs.phase1, phase1) || fortiEntry(configs.phase2, phase2) || fortiEntry(configs.interfaces, phase1)) throw new Error("FORTIGATE_VPN_ALREADY_EXISTS: تونل یا اینترفیس هم‌نام وجود دارد؛ ساخت، تنظیمات قبلی را بازنویسی نمی‌کند.");
  for (const target of targets) for (const key of ["localAddressNames", "remoteAddressNames"]) {
    for (const name of Array.isArray(target[key]) ? target[key] as string[] : []) if (fortiEntry(configs.addresses, name)) throw new Error("FORTIGATE_VPN_ADDRESS_ALREADY_EXISTS: شیء آدرس هم‌نام وجود دارد.");
  }
  const base = String(parameters.policyName ?? parameters.vpnName);
  if (parameters.createFirewallPolicy !== false && ["-lan-to-vpn", "-vpn-to-lan"].some(suffix => fortiEntry(configs.policies, `${base}${suffix}`.slice(0, 79), true))) throw new Error("FORTIGATE_VPN_POLICY_ALREADY_EXISTS: Policy هم‌نام وجود دارد.");
}
