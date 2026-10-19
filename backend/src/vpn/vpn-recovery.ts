/** Bounded reconnect pacing; never converts an outage into a user disconnect. No credentials live here. */
export class VpnRecoverySchedule {
  private attempts = new Map<string, { count: number; nextAt: number; blocked: boolean }>();
  due(id: string, now = Date.now()) { const a = this.attempts.get(id); return !a || !a.blocked && a.nextAt <= now; }
  failed(id: string, code: string | undefined, now = Date.now()) {
    if (!this.attempts.has(id) && this.attempts.size >= 256) this.attempts.delete(this.attempts.keys().next().value!);
    const count = (this.attempts.get(id)?.count ?? 0) + 1;
    const blocked = ["VPN_PPP_AUTH_FAILED", "VPN_OPENVPN_AUTH_FAILED", "VPN_CREDENTIAL_UNAVAILABLE", "VPN_CREDENTIAL_INVALID", "VPN_KEY_INVALID"].includes(code ?? "");
    const nextAt = now + Math.min(300000, 5000 * 2 ** Math.min(count - 1, 6));
    this.attempts.set(id, { count, nextAt, blocked });
  }
  clear(id: string) { this.attempts.delete(id); }
  info(id: string) { const a = this.attempts.get(id); return { recoveryBlocked: a?.blocked ?? false, retryAt: a && !a.blocked ? new Date(a.nextAt).toISOString() : null }; }
  retain(ids: Set<string>) { for (const id of this.attempts.keys()) if (!ids.has(id)) this.attempts.delete(id); }
}
