export function parseUfwAllowRuleNumbers(output: string, port: number, protocol: string) {
  const target = new RegExp(`\\b${port}\\/${protocol}\\b`, "i");
  return output.split(/\r?\n/)
    .filter((line) => target.test(line) && /\bALLOW(?: IN)?\b/i.test(line))
    .map((line) => Number(line.match(/^\[\s*(\d+)\]/)?.[1]))
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((left, right) => right - left);
}

export function firewalldHasPort(output: string, port: number, protocol: string) {
  return output.split(/\s+/).includes(`${port}/${protocol}`);
}

export function parseIptablesAllowRuleNumbers(output: string, port: number, protocol: string) {
  return output.split(/\r?\n/).flatMap((line) => {
    const fields = line.trim().split(/\s+/);
    const number = Number(fields[0]);
    return Number.isInteger(number) && fields[1] === "ACCEPT" && fields[2]?.toLowerCase() === protocol && line.includes(`dpt:${port}`) ? [number] : [];
  }).sort((left, right) => right - left);
}

export function parseNftAllowRules(output: string, port: number, protocol: string) {
  let family = "";
  let table = "";
  let chain = "";
  const rules: Array<{ family: string; table: string; chain: string; handle: number }> = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const tableMatch = line.match(/^table\s+(\S+)\s+(\S+)\s*\{/);
    if (tableMatch) { family = tableMatch[1]; table = tableMatch[2]; chain = ""; continue; }
    const chainMatch = line.match(/^chain\s+(\S+)\s*\{/);
    if (chainMatch) { chain = chainMatch[1]; continue; }
    const handle = Number(line.match(/#\s*handle\s+(\d+)/)?.[1]);
    const portMatch = new RegExp(`\\b${protocol}\\s+dport\\s+(?:${port}\\b|\\{[^}]*\\b${port}\\b[^}]*\\})`, "i").test(line);
    if (family && table && chain && Number.isInteger(handle) && portMatch && /\baccept\b/i.test(line) && [family, table, chain].every((value) => /^[\w.-]+$/.test(value))) {
      rules.push({ family, table, chain, handle });
    }
  }
  return rules;
}
