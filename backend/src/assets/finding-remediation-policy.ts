const IP_RESPONSE_CATEGORIES = new Set(["authentication", "authentication_attack", "vpn", "reconnaissance", "network_scan", "threat-prevention", "intrusion-detection"]);

export function findingSupportsIpResponse(finding: { category: string; srcIp: string | null; confidence: number; status: string }) {
  return Boolean(finding.srcIp && IP_RESPONSE_CATEGORIES.has(finding.category.toLowerCase()) && finding.confidence >= 0.7 && !["resolved", "closed", "false_positive", "accepted_risk", "suppressed"].includes(finding.status));
}
