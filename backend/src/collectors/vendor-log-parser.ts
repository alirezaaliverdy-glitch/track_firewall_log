const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

function safeDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseVendorLogTimestamp(raw: string, now = new Date()) {
  const iso = raw.match(/\b(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/);
  if (iso) return safeDate(`${iso[1]}T${iso[2]}`);

  const keyValue = raw.match(/\bdate=(\d{4}-\d{2}-\d{2})\s+time=(\d{2}:\d{2}:\d{2})\b/i);
  if (keyValue) return safeDate(`${keyValue[1]}T${keyValue[2]}`);

  const routerOs = raw.match(/\b([a-z]{3})\/(\d{1,2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})\b/i);
  if (routerOs) {
    const month = MONTHS[routerOs[1].toLowerCase()];
    if (month !== undefined) return new Date(Number(routerOs[3]), month, Number(routerOs[2]), ...routerOs[4].split(":").map(Number) as [number, number, number]);
  }

  const syslog = raw.match(/(?:^|\s)([a-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})(?:\s|:)/i);
  if (syslog) {
    const month = MONTHS[syslog[1].toLowerCase()];
    if (month !== undefined) {
      const candidate = new Date(now.getFullYear(), month, Number(syslog[2]), Number(syslog[3]), Number(syslog[4]), Number(syslog[5]));
      if (candidate.getTime() > now.getTime() + 24 * 60 * 60_000) candidate.setFullYear(candidate.getFullYear() - 1);
      return candidate;
    }
  }
  return undefined;
}
