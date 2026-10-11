export type DockerPublishedPort = {
  containerId: string;
  containerName: string;
  image: string;
  hostIp: string;
  hostPort: number;
  containerPort: number;
  protocol: "tcp" | "udp";
  blockedByDockerUser: boolean;
};

function bounded(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function dockerUserRuleBlocksPort(rules: string, port: number, protocol: string) {
  const portPattern = new RegExp(`(?:--ctorigdstport|--dport)\\s+${port}(?:\\s|$)`, "i");
  const protocolPattern = new RegExp(`(?:^|\\s)(?:-p|--protocol)\\s+${protocol}(?:\\s|$)`, "i");
  return rules.split(/\r?\n/).some((line) => portPattern.test(line) && protocolPattern.test(line) && /(?:^|\s)-j\s+(?:DROP|REJECT)(?:\s|$)/i.test(line));
}

export function parseDockerPublishedPorts(output: string, dockerUserRules = ""): DockerPublishedPort[] {
  const found = new Map<string, DockerPublishedPort>();
  for (const rawLine of output.split(/\r?\n/).slice(0, 512)) {
    let row: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawLine);
      row = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      continue;
    }
    const containerId = bounded(row.ID ?? row.Id, 64);
    const containerName = bounded(row.Names ?? row.Name, 128);
    const image = bounded(row.Image, 256);
    const ports = bounded(row.Ports, 4_000);
    for (const token of ports.split(",").map((item) => item.trim())) {
      const match = token.match(/^(.*):(\d{1,5})->(\d{1,5})\/(tcp|udp)$/i);
      if (!match) continue;
      const hostPort = Number(match[2]);
      const containerPort = Number(match[3]);
      const protocol = match[4].toLowerCase() as "tcp" | "udp";
      if (![hostPort, containerPort].every((port) => Number.isInteger(port) && port >= 1 && port <= 65535)) continue;
      const hostIp = match[1].replace(/^\[|\]$/g, "") || "0.0.0.0";
      const key = `${containerId}:${hostIp}:${hostPort}:${containerPort}:${protocol}`;
      found.set(key, {
        containerId,
        containerName,
        image,
        hostIp,
        hostPort,
        containerPort,
        protocol,
        blockedByDockerUser: dockerUserRuleBlocksPort(dockerUserRules, hostPort, protocol)
      });
    }
  }
  return [...found.values()];
}

export function dockerPublishedPortGuard(port: number, protocol: "tcp" | "udp") {
  const match = `-p ${protocol} -m conntrack --ctdir ORIGINAL --ctorigdstport ${port} -m comment --comment firewall-log-analyzer-port-${port} -j DROP`;
  return {
    match,
    check: `iptables -C DOCKER-USER ${match}`,
    insert: `iptables -I DOCKER-USER 1 ${match}`,
    remove: `iptables -D DOCKER-USER ${match}`,
    ipv6Check: `ip6tables -C DOCKER-USER ${match}`,
    ipv6Insert: `ip6tables -I DOCKER-USER 1 ${match}`,
    ipv6Remove: `ip6tables -D DOCKER-USER ${match}`
  };
}
