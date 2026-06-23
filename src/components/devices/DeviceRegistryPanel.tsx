import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle, Pencil, PlugZap, Plus, RefreshCw, Server, Trash2, XCircle } from "lucide-react";
import {
  createCredential,
  deleteCredential,
  listCredentials,
  type CredentialInput,
  type DeviceCredential,
  type DeviceCredentialType,
} from "@/lib/credentials";
import {
  createDevice,
  deleteDevice,
  getDeviceCapabilities,
  listDevices,
  testDeviceConnection,
  updateDevice,
  type Device,
  type DeviceCapabilities,
  type DeviceInput,
  type DeviceProtocol,
  type DeviceStatus,
  type DeviceType,
  type LinuxStatus,
  type MikroTikStatus,
  normalizeArray,
} from "@/lib/devices";
import { Input } from "@/components/ui/input";

const DEVICE_TYPES: Array<{ value: DeviceType; label: string; vendor: string }> = [
  { value: "linux_edge", label: "Linux Edge", vendor: "Linux Edge" },
  { value: "mikrotik", label: "MikroTik", vendor: "MikroTik" },
  { value: "fortigate", label: "FortiGate", vendor: "FortiGate" },
  { value: "pfsense", label: "pfSense", vendor: "pfSense" },
  { value: "generic_syslog_source", label: "Generic Syslog Source", vendor: "Generic Syslog Source" },
  { value: "generic_firewall", label: "Generic Firewall", vendor: "Generic Firewall" },
];

const PROTOCOLS: DeviceProtocol[] = ["ssh", "api", "syslog", "agent"];

const DEFAULT_FORM: DeviceInput = {
  name: "",
  vendor: "Linux Edge",
  type: "linux_edge",
  host: "",
  managementPort: 22,
  protocol: "ssh",
  credentialId: "",
  credentialRef: "",
  environment: "lab",
  tags: [],
  capabilities: {
    logIngest: true,
    continuousDetection: false,
    controlledChanges: false,
  },
};

const DEFAULT_CREDENTIAL_FORM: CredentialInput = {
  name: "",
  type: "password",
  username: "",
  password: "",
  privateKey: "",
  passphrase: "",
  sudo: true,
};

function statusClass(status: DeviceStatus) {
  if (status === "online") return "border-green-800 bg-green-950/40 text-green-300";
  if (status === "offline") return "border-yellow-800 bg-yellow-950/40 text-yellow-300";
  if (status === "error") return "border-red-800 bg-red-950/40 text-red-300";
  return "border-zinc-700 bg-zinc-950 text-zinc-400";
}

function statusIcon(status: DeviceStatus) {
  if (status === "online") return <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === "error") return <XCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Activity className="h-3.5 w-3.5" aria-hidden="true" />;
}

function protocolDefaultPort(protocol: DeviceProtocol, type: DeviceType) {
  if (protocol === "ssh") return 22;
  if (protocol === "syslog") return 514;
  if (protocol === "agent") return 8443;
  return type === "mikrotik" ? 8728 : 443;
}

function formatType(type: DeviceType) {
  return DEVICE_TYPES?.find((entry) => entry.value === type)?.label ?? type;
}

export default function DeviceRegistryPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [credentials, setCredentials] = useState<DeviceCredential[]>([]);
  const [form, setForm] = useState<DeviceInput>(DEFAULT_FORM);
  const [credentialForm, setCredentialForm] = useState<CredentialInput>(DEFAULT_CREDENTIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [linuxStatuses, setLinuxStatuses] = useState<Record<string, LinuxStatus>>({});
  const [mikrotikStatuses, setMikrotikStatuses] = useState<Record<string, MikroTikStatus>>({});
  const [deviceCapabilities, setDeviceCapabilities] = useState<Record<string, DeviceCapabilities>>({});

  const editingDevice = useMemo(
    () => normalizeArray<Device>(devices).find((device) => device.id === editingId) ?? null,
    [devices, editingId]
  );

  const refreshDevices = () => {
    setLoading(true);
    listDevices()
      .then((nextDevices) => {
        setDevices(normalizeArray<Device>(nextDevices));
        setLastRefreshedAt(new Date().toISOString());
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to load devices."))
      .finally(() => setLoading(false));
  };

  const refreshCredentials = () => {
    setCredentialLoading(true);
    listCredentials()
      .then((nextCredentials) => setCredentials(normalizeArray<DeviceCredential>(nextCredentials)))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to load credentials."))
      .finally(() => setCredentialLoading(false));
  };

  const refreshAll = () => {
    refreshDevices();
    refreshCredentials();
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
  };

  const submitDevice = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    const selectedCredential = credentials.find((credential) => credential.id === form.credentialId);
    const payload: DeviceInput = {
      ...form,
      credentialRef: selectedCredential?.name ?? form.credentialRef ?? "",
      environment: "lab",
      tags: [],
    };

    const request = editingId ? updateDevice(editingId, payload) : createDevice(payload);
    request
      .then((device) => {
        setMessage(`${device.name} saved.`);
        resetForm();
        refreshDevices();
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to save device."));
  };

  const startEdit = (device: Device) => {
    setEditingId(device.id);
    setForm({
      name: device.name,
      vendor: device.vendor,
      type: device.type,
      host: device.host,
      managementPort: device.managementPort,
      protocol: device.protocol,
      credentialId: device.credentialId ?? device.credential?.id ?? "",
      credentialRef: device.credentialRef ?? "",
      environment: device.environment,
      tags: [],
      capabilities: device.capabilities && typeof device.capabilities === "object" ? device.capabilities : {},
    });
  };

  const submitCredential = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    createCredential(credentialForm)
      .then((credential) => {
        setMessage(`Credential ${credential.name} saved.`);
        setCredentialForm(DEFAULT_CREDENTIAL_FORM);
        refreshCredentials();
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to save credential."));
  };

  const removeCredential = (credential: DeviceCredential) => {
    deleteCredential(credential.id)
      .then(() => {
        setMessage(`Credential ${credential.name} removed.`);
        refreshCredentials();
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to remove credential."));
  };

  const runConnectionTest = (device: Device) => {
    setTestingId(device.id);
    setMessage(null);
    testDeviceConnection(device.id)
      .then((result) => {
        setMessage(`${device.name}: ${result.message}`);
        if (result.linuxStatus) {
          setLinuxStatuses((current) => ({ ...current, [device.id]: result.linuxStatus as LinuxStatus }));
        }
        if (result.mikrotikStatus) {
          setMikrotikStatuses((current) => ({ ...current, [device.id]: result.mikrotikStatus as MikroTikStatus }));
        }
        refreshDevices();
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Connection test failed."))
      .finally(() => setTestingId(null));
  };

  const loadCapabilities = (device: Device) => {
    getDeviceCapabilities(device.id)
      .then((capabilities) => {
        setDeviceCapabilities((current) => ({ ...current, [device.id]: capabilities }));
        setMessage(`${device.name}: capabilities loaded.`);
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to load capabilities."));
  };

  const removeDevice = (device: Device) => {
    deleteDevice(device.id)
      .then(() => {
        setMessage(`${device.name} removed.`);
        if (editingId === device.id) resetForm();
        refreshDevices();
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to remove device."));
  };

  const safeDevices = normalizeArray<Device>(devices);
  const safeCredentials = normalizeArray<DeviceCredential>(credentials);

  return (
    <section className="mb-4 rounded-lg border border-blue-900/50 bg-slate-950/70 p-4 shadow-[inset_0_1px_0_rgba(59,130,246,0.08)]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-left text-lg font-semibold text-zinc-100">Device Registry</h2>
          <p className="mt-1 text-left text-sm text-zinc-400">
            Edge and firewall inventory for future monitored integrations.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm font-medium text-zinc-300 transition-colors hover:border-blue-700 hover:text-blue-200"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>
      <p className="mb-4 text-left text-xs text-zinc-500">
        Last refreshed: {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleString() : "-"}
      </p>

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <form onSubmit={submitCredential} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">Credential Manager</h3>
            <button
              type="button"
              onClick={refreshCredentials}
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-100"
            >
              {credentialLoading ? "Loading" : "Refresh"}
            </button>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1 text-left text-xs font-medium text-zinc-400">
              Name
              <Input
                value={credentialForm.name}
                onChange={(event) => setCredentialForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="ubuntu-lab"
                required
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-left text-xs font-medium text-zinc-400">
                Type
                <select
                  value={credentialForm.type}
                  onChange={(event) => setCredentialForm((prev) => ({ ...prev, type: event.target.value as DeviceCredentialType }))}
                  className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                >
                  <option value="password">password</option>
                  <option value="private_key">private_key</option>
                </select>
              </label>
              <label className="grid gap-1 text-left text-xs font-medium text-zinc-400">
                Username
                <Input
                  value={credentialForm.username}
                  onChange={(event) => setCredentialForm((prev) => ({ ...prev, username: event.target.value }))}
                  placeholder="alireza"
                  required
                />
              </label>
            </div>
            {credentialForm.type === "password" ? (
              <label className="grid gap-1 text-left text-xs font-medium text-zinc-400">
                Password
                <Input
                  type="password"
                  value={credentialForm.password ?? ""}
                  onChange={(event) => setCredentialForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
              </label>
            ) : (
              <>
                <label className="grid gap-1 text-left text-xs font-medium text-zinc-400">
                  Private Key
                  <textarea
                    value={credentialForm.privateKey ?? ""}
                    onChange={(event) => setCredentialForm((prev) => ({ ...prev, privateKey: event.target.value }))}
                    className="min-h-28 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-700"
                    required
                  />
                </label>
                <label className="grid gap-1 text-left text-xs font-medium text-zinc-400">
                  Passphrase
                  <Input
                    type="password"
                    value={credentialForm.passphrase ?? ""}
                    onChange={(event) => setCredentialForm((prev) => ({ ...prev, passphrase: event.target.value }))}
                  />
                </label>
              </>
            )}
            <label className="flex items-center gap-2 text-left text-xs font-medium text-zinc-400">
              <input
                type="checkbox"
                checked={credentialForm.sudo}
                onChange={(event) => setCredentialForm((prev) => ({ ...prev, sudo: event.target.checked }))}
              />
              Passwordless sudo available
            </label>
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Save credential
            </button>
          </div>
        </form>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-100">Saved Credentials</h3>
          {safeCredentials.length === 0 ? (
            <p className="text-left text-sm text-zinc-500">No credentials saved yet.</p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {safeCredentials.map((credential) => (
                <div key={credential.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0 text-left">
                    <p className="truncate text-sm font-medium text-zinc-100">{credential.name}</p>
                    <p className="text-xs text-zinc-500">{credential.type} · {credential.username} · sudo={String(credential.sudo)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCredential(credential)}
                    className="inline-flex h-8 items-center gap-1.5 rounded border border-red-900/70 bg-red-950/30 px-2.5 text-xs font-medium text-red-300 hover:bg-red-950/50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <form onSubmit={submitDevice} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">
              {editingDevice ? `Edit ${editingDevice.name}` : "Add device"}
            </h3>
            {editingDevice && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-100"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="grid gap-3">
            <label className="grid gap-1 text-left text-xs font-medium text-zinc-400">
              Name
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Edge Router"
                required
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-left text-xs font-medium text-zinc-400">
                Type
                <select
                  value={form.type}
                  onChange={(event) => {
                    const type = event.target.value as DeviceType;
                    const vendor = DEVICE_TYPES?.find((entry) => entry.value === type)?.vendor ?? form.vendor;
                    setForm((prev) => {
                      const protocol = type === "mikrotik" ? "ssh" : prev.protocol;
                      return {
                        ...prev,
                        type,
                        vendor,
                        protocol,
                        managementPort: protocolDefaultPort(protocol, type),
                      };
                    });
                  }}
                  className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                >
                  {DEVICE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-left text-xs font-medium text-zinc-400">
                Protocol
                <select
                  value={form.protocol}
                  onChange={(event) => {
                    const protocol = event.target.value as DeviceProtocol;
                    setForm((prev) => ({
                      ...prev,
                      protocol: prev.type === "mikrotik" ? "ssh" : protocol,
                      managementPort: protocolDefaultPort(prev.type === "mikrotik" ? "ssh" : protocol, prev.type),
                    }));
                  }}
                  className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                >
                  {(form.type === "mikrotik" ? ["ssh"] as DeviceProtocol[] : PROTOCOLS).map((protocol) => (
                    <option key={protocol} value={protocol}>{protocol}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_112px]">
              <label className="grid gap-1 text-left text-xs font-medium text-zinc-400">
                Host
                <Input
                  value={form.host}
                  onChange={(event) => setForm((prev) => ({ ...prev, host: event.target.value }))}
                  placeholder="192.168.7.1"
                  required
                />
              </label>
              <label className="grid gap-1 text-left text-xs font-medium text-zinc-400">
                Port
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.managementPort}
                  onChange={(event) => setForm((prev) => ({ ...prev, managementPort: Number(event.target.value) }))}
                  required
                />
              </label>
            </div>

            <label className="grid gap-1 text-left text-xs font-medium text-zinc-400">
              Credential
              <select
                value={form.credentialId ?? ""}
                onChange={(event) => {
                  const credentialId = event.target.value;
                  const credential = safeCredentials.find((item) => item.id === credentialId);
                  setForm((prev) => ({
                    ...prev,
                    credentialId,
                    credentialRef: credential?.name ?? "",
                  }));
                }}
                className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
              >
                <option value="">Select credential</option>
                {safeCredentials.map((credential) => (
                  <option key={credential.id} value={credential.id}>{credential.name} ({credential.username})</option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {editingDevice ? "Save device" : "Add device"}
            </button>
          </div>
        </form>

        <div className="min-h-[260px] rounded-lg border border-zinc-800 bg-zinc-950">
          {loading ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 p-6 text-center text-zinc-500">
              <RefreshCw className="h-8 w-8 animate-spin" aria-hidden="true" />
              <p className="text-sm">Loading devices...</p>
            </div>
          ) : safeDevices.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 p-6 text-center text-zinc-500">
              <Server className="h-8 w-8" aria-hidden="true" />
              <p className="text-sm">No devices registered yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {safeDevices.map((device) => {
                const capabilities = device.capabilities && typeof device.capabilities === "object" ? device.capabilities : {};
                const linuxStatus = linuxStatuses[device.id] ?? (capabilities.linuxStatus && typeof capabilities.linuxStatus === "object" ? capabilities.linuxStatus as LinuxStatus : undefined);
                const mikrotikStatus = mikrotikStatuses[device.id] ?? (capabilities.mikrotikStatus && typeof capabilities.mikrotikStatus === "object" ? capabilities.mikrotikStatus as MikroTikStatus : undefined);
                const connectorCapabilities = deviceCapabilities[device.id];
                const statusChecks = normalizeArray<NonNullable<Device["statusChecks"]>[number]>(device.statusChecks);
                const mikrotikDiscovery = connectorCapabilities?.mikrotik ?? mikrotikStatus?.mikrotik;
                return (
                <article key={device.id} className="p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-left text-sm font-semibold text-zinc-100">{device.name}</h3>
                        <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${statusClass(device.status)}`}>
                          {statusIcon(device.status)}
                          {device.status}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
                        <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">{formatType(device.type)}</span>
                        <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">{device.protocol}</span>
                        <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">{device.host}:{device.managementPort}</span>
                        {(device.credential?.name ?? device.credentialRef) && (
                          <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">credential: {device.credential?.name ?? device.credentialRef}</span>
                        )}
                      </div>
                      <p className="mt-2 text-left text-xs text-zinc-500">
                        Capabilities: {Object.entries(capabilities).map(([key, value]) => `${key}=${String(value)}`).join(", ") || "none"}
                      </p>
                      {connectorCapabilities && (
                        device.type === "mikrotik" ? (
                          <p className="mt-1 text-left text-xs text-green-300">
                            MikroTik: readFirewall={String(connectorCapabilities.canReadFirewall)} readLogs={String(connectorCapabilities.canReadLogs)} writeActions={String(connectorCapabilities.canExecuteWriteActions)}
                          </p>
                        ) : (
                          <p className="mt-1 text-left text-xs text-green-300">
                            Linux SSH: UFW={String(connectorCapabilities.canUseUfw)} open={String(connectorCapabilities.canOpenPort)} close={String(connectorCapabilities.canClosePort)} block={String(connectorCapabilities.canBlockSourceIp)}
                          </p>
                        )
                      )}
                      {(mikrotikStatus || mikrotikDiscovery) && (
                        <div className="mt-2 rounded border border-zinc-800 bg-black/30 p-2 text-left text-xs text-zinc-400">
                          {mikrotikStatus && (
                            <>
                              <p className="text-zinc-300">MikroTik SSH: {mikrotikStatus.connected ? "connected" : mikrotikStatus.errorCode ?? "failed"} · {mikrotikStatus.username ?? "unknown"}@{device.host}:{device.managementPort}</p>
                              <p className="mt-1">Credential: {mikrotikStatus.credentialResolved ? mikrotikStatus.credentialName ?? "resolved" : "missing"} · Write actions: {mikrotikStatus.capabilities?.canExecuteWriteActions ? "controlled templates enabled" : "disabled"}</p>
                            </>
                          )}
                          {mikrotikDiscovery && (
                            <div className="mt-1 grid gap-1 sm:grid-cols-2">
                              <p>Identity: {mikrotikDiscovery.identity ?? connectorCapabilities?.identity ?? "unknown"}</p>
                              <p>RouterOS: {mikrotikDiscovery.routerosVersion ?? connectorCapabilities?.routerosVersion ?? "unknown"}</p>
                              <p>Interfaces: {normalizeArray<string>(mikrotikDiscovery.interfaces).length || (connectorCapabilities?.interfaceCount ?? 0)}</p>
                              <p>Filter rules: {normalizeArray<string>(mikrotikDiscovery.firewallFilterRules).length || (connectorCapabilities?.firewallFilterRuleCount ?? 0)}</p>
                              <p>NAT rules: {normalizeArray<string>(mikrotikDiscovery.natRules).length || (connectorCapabilities?.natRuleCount ?? 0)}</p>
                              <p>Address lists: {normalizeArray<string>(mikrotikDiscovery.addressLists).length || (connectorCapabilities?.addressListCount ?? 0)}</p>
                              <p className="sm:col-span-2">Services: {normalizeArray<string>(mikrotikDiscovery.services).slice(0, 6).join(", ") || normalizeArray<string>(connectorCapabilities?.serviceSummary).slice(0, 6).join(", ") || "unknown"}</p>
                            </div>
                          )}
                          {mikrotikStatus && normalizeArray<{ name: string; status: string; code?: string }>(mikrotikStatus.stages).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {normalizeArray<{ name: string; status: string; code?: string }>(mikrotikStatus.stages).map((stage) => (
                                <span key={stage.name} className={`rounded border px-1.5 py-0.5 ${stage.status === "failed" ? "border-red-900 text-red-300" : stage.status === "warning" ? "border-yellow-900 text-yellow-300" : "border-green-900 text-green-300"}`}>
                                  {stage.name}:{stage.status}{stage.code ? `/${stage.code}` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          {normalizeArray<{ code: string; message: string }>(mikrotikStatus?.warnings ?? connectorCapabilities?.warnings).length > 0 && (
                            <div className="mt-2 text-yellow-300">
                              {normalizeArray<{ code: string; message: string }>(mikrotikStatus?.warnings ?? connectorCapabilities?.warnings).map((warning) => (
                                <p key={`${warning.code}-${warning.message}`}>{warning.code}: {warning.message}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {linuxStatus && (
                        <div className="mt-2 rounded border border-zinc-800 bg-black/30 p-2 text-left text-xs text-zinc-400">
                          <p className="text-zinc-300">SSH: {linuxStatus.connected ? "connected" : linuxStatus.errorCode ?? "failed"} · {linuxStatus.username ?? "unknown"}@{device.host}:{device.managementPort}</p>
                          <p className="mt-1">Credential: {linuxStatus.credentialResolved ? linuxStatus.credentialName ?? "resolved" : "missing"} · UFW: {linuxStatus.capabilities?.canUseUfw ? "available" : "unavailable"} · SSH port: {linuxStatus.currentSshPort ?? "unknown"}</p>
                          {linuxStatus.sshServiceStatus && <p className="mt-1">Service: {linuxStatus.sshServiceStatus}</p>}
                          {normalizeArray<{ name: string; status: string; code?: string }>(linuxStatus.stages).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {normalizeArray<{ name: string; status: string; code?: string }>(linuxStatus.stages).map((stage) => (
                                <span key={stage.name} className={`rounded border px-1.5 py-0.5 ${stage.status === "failed" ? "border-red-900 text-red-300" : stage.status === "warning" ? "border-yellow-900 text-yellow-300" : "border-green-900 text-green-300"}`}>
                                  {stage.name}:{stage.status}{stage.code ? `/${stage.code}` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          {normalizeArray<{ code: string; message: string }>(linuxStatus.warnings).length > 0 && (
                            <div className="mt-2 text-yellow-300">
                              {normalizeArray<{ code: string; message: string }>(linuxStatus.warnings).map((warning) => (
                                <p key={`${warning.code}-${warning.message}`}>{warning.code}: {warning.message}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {statusChecks[0] && (
                        <p className="mt-1 text-left text-xs text-zinc-500">
                          Last check: {statusChecks[0].message ?? statusChecks[0].status}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => runConnectionTest(device)}
                        disabled={testingId === device.id}
                        className="inline-flex h-8 items-center gap-1.5 rounded border border-blue-800/70 bg-blue-950/40 px-2.5 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-900/50 disabled:opacity-60"
                      >
                        <PlugZap className="h-3.5 w-3.5" aria-hidden="true" />
                        {testingId === device.id ? "Testing" : "Test"}
                      </button>
                      <button
                        type="button"
                        onClick={() => loadCapabilities(device)}
                        className="inline-flex h-8 items-center gap-1.5 rounded border border-green-900/70 bg-green-950/30 px-2.5 text-xs font-medium text-green-300 transition-colors hover:bg-green-950/50"
                      >
                        Capabilities
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(device)}
                        className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-300 transition-colors hover:text-zinc-100"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeDevice(device)}
                        className="inline-flex h-8 items-center gap-1.5 rounded border border-red-900/70 bg-red-950/30 px-2.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-950/50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              )})}
            </div>
          )}
        </div>
      </div>

      {message && (
        <p className="mt-3 text-left text-xs text-zinc-400" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}
