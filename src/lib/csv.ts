// simple CSV parser: returns array of objects using first row as header
export function parseCSV(csvText: string) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    // split on commas, naive but fine for simple CSVs without quoted commas
    const values = line.split(",").map((v) => v.trim());
    const obj: Record<string, string | number> = {};
    for (let i = 0; i < header.length; i++) {
      const key = header[i] || `col_${i}`;
      const raw = values[i] ?? "";
      // try to convert to number when appropriate
      const num = Number(raw);
      obj[key] = raw !== "" && !Number.isNaN(num) ? num : raw;
    }
    return obj;
  });
  return rows;
}

// parse RouterOS-style automation/log files into structured JSON records
export function parseAutomation(logText: string) {
  const lines = logText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));

  if (!lines.length) return [];

  const year = new Date().getFullYear();
  const out: Array<Record<string, string | number>> = [];

  for (const line of lines) {
    // Example full pattern: "12-07 07:11:30 firewall,info PORTSCAN-DROP  input: ... 172.232.253.221:43250->5.202.180.214:3400, len 60"
    const fullRe = /^([0-1]?\d-[0-3]?\d)\s+(\d{2}:\d{2}:\d{2})\s+([^,\s]+),([^\s]+)\s+([A-Z0-9\-]+)\s*(.*)$/i;
    const m = line.match(fullRe);

    const base: Record<string, string | number> = {
      Date: "",
      Time: "",
      Service: "",
      Level: "",
      Event: "",
      Message: line,
    };

    if (m) {
      const [, mmdd, time, service, level, event, rest] = m;
      const [mth, day] = mmdd.split("-");
      const iso = `${year}-${mth.padStart(2, "0")}-${day.padStart(2, "0")}`;
      base.Date = iso;
      base.Time = time;
      base.Service = service;
      base.Level = level;
      base.Event = event;
      base.Message = rest || "";

      // extract flow like 172.232.253.221:43250->5.202.180.214:3400
      const flow = (rest || "").match(/(\d{1,3}(?:\.\d{1,3}){3}):(\d+)->(\d{1,3}(?:\.\d{1,3}){3}):(\d+)/);
      if (flow) {
        base.SrcIP = flow[1];
        base.SrcPort = Number(flow[2]);
        base.DstIP = flow[3];
        base.DstPort = Number(flow[4]);
      }

      // dhcp assigned/deassigned IP
      const singleIp = (rest || "").match(/(?:assigned|deassigned)\s+(\d{1,3}(?:\.\d{1,3}){3})/i);
      if (singleIp) base.IP = singleIp[1];

      // MAC
      const mac = (rest || "").match(/([0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5})/);
      if (mac) base.SrcMAC = mac[1];

      // len
      const lenm = (rest || "").match(/len\s+(\d+)/i);
      if (lenm) base.Len = Number(lenm[1]);

      // hostname after mac in dhcp lines
      const host = (rest || "").match(/for\s+[0-9A-Fa-f:]+\s*(.*)$/i);
      if (host && host[1]) base.Hostname = host[1].trim();

      out.push(base);
      continue;
    }

    // fallback: short time-only lines like "01:25:07 firewall,info ..."
    const shortRe = /^(\d{2}:\d{2}:\d{2})\s+([^,\s]+),([^\s]+)\s+(.*)$/;
    const m2 = line.match(shortRe);
    if (m2) {
      const [, time, service, level, rest] = m2;
      const rec: Record<string, string | number> = { Date: `${year}-01-01`, Time: time, Service: service, Level: level, Event: "", Message: rest };
      const ip = rest.match(/(?:assigned|deassigned)\s+(\d{1,3}(?:\.\d{1,3}){3})/i);
      if (ip) rec.IP = ip[1];
      const mac2 = rest.match(/([0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5})/);
      if (mac2) rec.SrcMAC = mac2[1];
      out.push(rec);
      continue;
    }

    // last resort
    out.push({ Date: "", Time: "", Service: "", Level: "", Event: "", Message: line });
  }

  return out;
}
