const DOCKER_UNPUBLISH_SCRIPT = String.raw`import copy
import json
import re
import socket
import subprocess
import sys
import time
import urllib.parse

container_id = sys.argv[1]
host_port = int(sys.argv[2])
protocol = sys.argv[3]

if not re.fullmatch(r"[a-fA-F0-9]{12,64}", container_id):
    raise SystemExit("INVALID_CONTAINER_ID")
if host_port < 1 or host_port > 65535 or protocol not in ("tcp", "udp"):
    raise SystemExit("INVALID_PORT_BINDING")

def docker(*args, check=True):
    return subprocess.run(["docker", *args], check=check, text=True, capture_output=True)

def decode_chunked(body):
    result = bytearray()
    while body:
        line, sep, rest = body.partition(b"\r\n")
        if not sep:
            break
        size = int(line.split(b";", 1)[0], 16)
        if size == 0:
            break
        result.extend(rest[:size])
        body = rest[size + 2:]
    return bytes(result)

def engine(method, path, payload=None):
    body = b"" if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    request = (
        f"{method} {path} HTTP/1.1\r\n"
        "Host: docker\r\n"
        "Content-Type: application/json\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Connection: close\r\n\r\n"
    ).encode() + body
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    client.settimeout(30)
    client.connect("/var/run/docker.sock")
    client.sendall(request)
    chunks = []
    while True:
        chunk = client.recv(65536)
        if not chunk:
            break
        chunks.append(chunk)
    client.close()
    raw = b"".join(chunks)
    header, separator, response_body = raw.partition(b"\r\n\r\n")
    if not separator:
        raise RuntimeError("DOCKER_ENGINE_INVALID_RESPONSE")
    status = int(header.split(b"\r\n", 1)[0].split()[1])
    if b"transfer-encoding: chunked" in header.lower():
        response_body = decode_chunked(response_body)
    parsed = json.loads(response_body.decode() or "{}")
    if status < 200 or status >= 300:
        raise RuntimeError("DOCKER_ENGINE_ERROR: " + str(parsed.get("message", status)))
    return parsed

inspect = json.loads(docker("inspect", container_id).stdout)[0]
labels = inspect.get("Config", {}).get("Labels") or {}
if labels.get("com.docker.swarm.service.id"):
    raise SystemExit("SWARM_SERVICE_MUST_BE_UPDATED_AT_SERVICE_LEVEL")
host_config = copy.deepcopy(inspect.get("HostConfig") or {})
if host_config.get("AutoRemove"):
    raise SystemExit("AUTO_REMOVE_CONTAINER_IS_NOT_SAFE_TO_RECREATE")
if str(host_config.get("NetworkMode") or "").startswith("container:"):
    raise SystemExit("CONTAINER_NETWORK_NAMESPACE_IS_NOT_SAFE_TO_RECREATE")

bindings = host_config.get("PortBindings") or {}
removed = []
for container_port, entries in list(bindings.items()):
    if not container_port.endswith("/" + protocol):
        continue
    kept = []
    for entry in entries or []:
        if str(entry.get("HostPort") or "") == str(host_port):
            removed.append({"containerPort": container_port, "hostIp": str(entry.get("HostIp") or "")})
        else:
            kept.append(entry)
    if kept:
        bindings[container_port] = kept
    else:
        bindings.pop(container_port, None)
if not removed:
    raise SystemExit("PUBLISHED_BINDING_NOT_FOUND")
host_config["PortBindings"] = bindings

# Preserve named and anonymous data volumes. Anonymous volumes are not always
# represented in HostConfig.Binds; allocating replacements would make a
# recreated database service start against empty storage.
binds = list(host_config.get("Binds") or [])
bound_targets = set()
for binding in binds:
    parts = str(binding).split(":")
    if len(parts) >= 2:
        bound_targets.add(parts[1])
for mount in inspect.get("Mounts") or []:
    if mount.get("Type") != "volume":
        continue
    source = str(mount.get("Name") or mount.get("Source") or "")
    destination = str(mount.get("Destination") or "")
    if source and destination and destination not in bound_targets:
        binds.append(source + ":" + destination + (":ro" if not mount.get("RW", True) else ""))
        bound_targets.add(destination)
host_config["Binds"] = binds

name = str(inspect.get("Name") or "").lstrip("/")
if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]+", name):
    raise SystemExit("INVALID_CONTAINER_NAME")
backup_name = (name + "__firewall_backup_" + str(int(time.time())))[:128]
payload = copy.deepcopy(inspect.get("Config") or {})
payload["HostConfig"] = host_config

networks = inspect.get("NetworkSettings", {}).get("Networks") or {}
endpoints = {}
for network_name, settings in networks.items():
    endpoint = {}
    aliases = [item for item in (settings.get("Aliases") or []) if item and item not in (container_id, container_id[:12])]
    if aliases:
        endpoint["Aliases"] = aliases
    if settings.get("Links"):
        endpoint["Links"] = settings["Links"]
    if settings.get("DriverOpts"):
        endpoint["DriverOpts"] = settings["DriverOpts"]
    ipam = settings.get("IPAMConfig")
    if isinstance(ipam, dict) and any(ipam.values()):
        endpoint["IPAMConfig"] = ipam
    endpoints[network_name] = endpoint
if endpoints and host_config.get("NetworkMode") not in ("host", "none"):
    payload["NetworkingConfig"] = {"EndpointsConfig": endpoints}

def reconnect_backup():
    for network_name, settings in networks.items():
        args = ["network", "connect"]
        ipam = settings.get("IPAMConfig") or {}
        if ipam.get("IPv4Address"):
            args += ["--ip", str(ipam["IPv4Address"])]
        if ipam.get("IPv6Address"):
            args += ["--ip6", str(ipam["IPv6Address"])]
        for alias in endpoints.get(network_name, {}).get("Aliases", []):
            args += ["--alias", str(alias)]
        args += [network_name, backup_name]
        docker(*args, check=False)

new_id = None
renamed = False
try:
    docker("rename", container_id, backup_name)
    renamed = True
    docker("stop", "--time", str(min(max(int(inspect.get("Config", {}).get("StopTimeout") or 10), 1), 60)), backup_name)
    for network_name in networks:
        docker("network", "disconnect", "--force", network_name, backup_name)
    created = engine("POST", "/containers/create?name=" + urllib.parse.quote(name, safe=""), payload)
    new_id = str(created["Id"])
    docker("start", new_id)
    deadline = time.time() + 30
    while time.time() < deadline:
        current = json.loads(docker("inspect", new_id).stdout)[0]
        state = current.get("State") or {}
        if not state.get("Running"):
            raise RuntimeError("REPLACEMENT_CONTAINER_NOT_RUNNING")
        health = (state.get("Health") or {}).get("Status")
        if health in (None, "healthy"):
            break
        if health == "unhealthy":
            raise RuntimeError("REPLACEMENT_CONTAINER_UNHEALTHY")
        time.sleep(1)
    current = json.loads(docker("inspect", new_id).stdout)[0]
    current_health = (current.get("State", {}).get("Health") or {}).get("Status")
    if current_health not in (None, "healthy"):
        raise RuntimeError("REPLACEMENT_CONTAINER_HEALTH_TIMEOUT")
    for entries in (current.get("HostConfig", {}).get("PortBindings") or {}).values():
        if any(str(entry.get("HostPort") or "") == str(host_port) for entry in entries or []):
            raise RuntimeError("PUBLISHED_BINDING_STILL_PRESENT")
    docker("rm", backup_name)
    print(json.dumps({
        "status": "unpublished",
        "containerId": new_id[:12],
        "containerName": name,
        "hostPort": host_port,
        "protocol": protocol,
        "removedBindings": len(removed),
        "composeManaged": bool(labels.get("com.docker.compose.project")),
        "composeProject": str(labels.get("com.docker.compose.project") or "")[:128],
        "composeService": str(labels.get("com.docker.compose.service") or "")[:128]
    }, separators=(",", ":")))
except Exception:
    if new_id:
        docker("stop", "--time", "5", new_id, check=False)
        docker("rm", new_id, check=False)
    if renamed:
        reconnect_backup()
        docker("rename", backup_name, name, check=False)
        docker("start", name, check=False)
    raise
`;

export function dockerUnpublishCommand(containerId: string, hostPort: number, protocol: "tcp" | "udp", sudo = "sudo -n ") {
  if (!/^[a-fA-F0-9]{12,64}$/.test(containerId)) throw new Error("INVALID_CONTAINER_ID");
  if (!Number.isInteger(hostPort) || hostPort < 1 || hostPort > 65535) throw new Error("INVALID_PORT");
  if (protocol !== "tcp" && protocol !== "udp") throw new Error("INVALID_PROTOCOL");
  const encoded = Buffer.from(DOCKER_UNPUBLISH_SCRIPT, "utf8").toString("base64");
  return `${sudo}python3 -c "import base64;exec(base64.b64decode('${encoded}'))" ${containerId} ${hostPort} ${protocol}`;
}

