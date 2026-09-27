type CounterSample = {
  metricKey: string;
  value: number;
  timestamp: Date | string;
  labelsJson?: unknown;
};

type RatePoint = { timestamp: Date | string; value: number; unit: "Mbps" };

function interfaceName(sample: CounterSample) {
  const labels = sample.labelsJson;
  return labels && typeof labels === "object" && !Array.isArray(labels) && typeof (labels as Record<string, unknown>).interface === "string"
    ? (labels as Record<string, string>).interface : "";
}

function rates(samples: CounterSample[], key: string, name: string): RatePoint[] {
  const counters = samples
    .filter((sample) => sample.metricKey === key && interfaceName(sample) === name)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const result: RatePoint[] = [];
  for (let index = 1; index < counters.length; index += 1) {
    const previous = counters[index - 1];
    const current = counters[index];
    const elapsedSeconds = (new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime()) / 1000;
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 5 || elapsedSeconds > 3600) continue;
    if (!Number.isSafeInteger(previous.value) || !Number.isSafeInteger(current.value) || current.value < previous.value) continue;
    const mbps = ((current.value - previous.value) * 8) / elapsedSeconds / 1_000_000;
    if (Number.isFinite(mbps) && mbps <= 1_000_000) result.push({ timestamp: current.timestamp, value: Math.round(mbps * 1000) / 1000, unit: "Mbps" });
  }
  return result;
}

export function buildDeviceTrafficSeries(samples: CounterSample[]) {
  samples = samples.filter((sample) => Number.isFinite(sample.value) && sample.value >= 0 && Number.isFinite(new Date(sample.timestamp).getTime()));
  const names = [...new Set(samples.filter((sample) => /^network\.(?:rx|tx)_(?:bytes|mbps)$/.test(sample.metricKey)).map(interfaceName).filter(Boolean))];
  const interfaceId = names
    .map((name) => ({
      name,
      latest: Math.max(0, ...samples.filter((sample) => interfaceName(sample) === name).map((sample) => new Date(sample.timestamp).getTime())),
      activity: samples.filter((sample) => interfaceName(sample) === name && /_mbps$/.test(sample.metricKey) && Number.isFinite(sample.value) && sample.value >= 0).reduce((sum, sample) => sum + sample.value, 0),
      count: rates(samples, "network.rx_bytes", name).length + rates(samples, "network.tx_bytes", name).length
        + samples.filter((sample) => interfaceName(sample) === name && /_mbps$/.test(sample.metricKey)).length
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.latest - a.latest || b.activity - a.activity || b.count - a.count || a.name.localeCompare(b.name))[0]?.name ?? null;
  const direct = (key: string) => samples.filter((sample) => sample.metricKey === key && interfaceName(sample) === interfaceId && Number.isFinite(sample.value) && sample.value >= 0)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((sample) => ({ timestamp: sample.timestamp, value: sample.value, unit: "Mbps" as const }));
  const directMode = !!interfaceId && samples.some((sample) => interfaceName(sample) === interfaceId && /_mbps$/.test(sample.metricKey) && Number.isFinite(sample.value) && sample.value >= 0);
  return {
    interface: interfaceId,
    method: directMode
      ? "device_5m_average" : "counter_delta",
    rx: interfaceId ? directMode ? direct("network.rx_mbps") : rates(samples, "network.rx_bytes", interfaceId) : [],
    tx: interfaceId ? directMode ? direct("network.tx_mbps") : rates(samples, "network.tx_bytes", interfaceId) : []
  };
}
