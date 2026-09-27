import type { CiscoCliCommandSpec as Spec } from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { parseCiscoInterfacesStatus } from "../connectors/cisco/ios-xe/cisco-iosxe.parsers.js";
type Params = Record<string, unknown>;
const fail = (message: string): never => { throw new Error(message); };
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function canonicalInterface(value: unknown): string {
  const name = String(value ?? "").trim().replace(/^Gi(?=\d)/i, "GigabitEthernet").replace(/^Fa(?=\d)/i, "FastEthernet").replace(/^Te(?=\d)/i, "TenGigabitEthernet").replace(/^Po(?=\d)/i, "Port-channel");
  if (!/^(?:(?:GigabitEthernet|FastEthernet|TenGigabitEthernet)\d+(?:\/\d+){1,2}|Port-channel\d+)$/i.test(name)) fail("نام پورت معتبر نیست؛ از پورت واقعی دستگاه استفاده کنید.");
  return name;
}
export function vlanSet(value: unknown): Set<number> {
  const text = String(value ?? "").trim();
  if (text === "all") return new Set(Array.from({ length: 4094 }, (_, i) => i + 1));
  if (text === "none") return new Set();
  if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(text)) fail("فهرست VLAN معتبر نیست؛ مانند 10,20-25. هیچ بخشی خودکار حذف نمی‌شود.");
  const result = new Set<number>();
  for (const part of text.split(",")) {
    const [start, last] = part.split("-").map(Number), end = last ?? start;
    if (start < 1 || end > 4094 || end < start) fail("VLAN باید در بازه ۱ تا ۴۰۹۴ باشد و بازه معکوس نباشد.");
    for (let id = start; id <= end; id++) result.add(id);
  }
  return result;
}
const same = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every(id => b.has(id));
const oneVlan = (value: unknown) => { const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 4094) fail("شماره VLAN باید بین ۱ و ۴۰۹۴ باشد."); return n; };
const group = (p: Params) => { const n = Number(p.groupId); if (!Number.isInteger(n) || n < 1 || n > 24) fail("شماره Port-channel باید بین 1 and 24 باشد."); return n; };
const ack = (p: Params) => { if (p.acknowledgeDisruption !== true && p.acknowledgeDisruption !== "true") fail("Confirm: تأیید اثر احتمالی روی ترافیک لازم است."); };
export function memberPorts(value: unknown, minimum = 1): string[] {
  const ports = String(value ?? "").split(",").map(canonicalInterface);
  if (ports.length < minimum || ports.length > 8 || ports.some(port => /^Port-channel/i.test(port))) fail("Select 2 to 8 برای ساخت، یا ۱ تا ۸ پورت فیزیکی برای تغییر اعضا.");
  if (new Set(ports.map(p => p.toLowerCase())).size !== ports.length) fail("پورت‌ها باید unique باشند.");
  if (new Set(ports.map(p => p.replace(/\d.*$/, "").toLowerCase())).size !== 1) fail("پورت‌ها باید same Ethernet type باشند.");
  return ports;
}
export function channelRow(output: string, id: number) {
  const match = output.match(new RegExp(`(?:^|\\n)\\s*${id}\\s+Po${id}\\(([^)]+)\\)\\s+(LACP|PAgP|-)([^]*?)(?=\\n\\s*\\d+\\s+Po|$)`, "i"));
  if (!match) return null;
  const members = [...match[3].matchAll(/((?:Gi|Fa|Te|GigabitEthernet|FastEthernet|TenGigabitEthernet)\d+(?:\/\d+){1,2})\(([^)]+)\)/gi)].map(m => ({ name: canonicalInterface(m[1]), flags: m[2] }));
  return { flags: match[1], protocol: match[2], members };
}
const read = (id: string, command: string, check: (output: string) => void): Spec => ({ commandId: id, command, strict: true, redactOutput: /running-config/.test(command), validateOutput: check });
const write = (id: string, command: string): Spec => ({ commandId: id, command, write: true, strict: true });
function config(output: string, name: string) {
  if (!new RegExp(`(?:^|\\n)\\s*interface\\s+${escape(name)}\\s*(?:\\n|$)`, "i").test(output)) fail("اطلاعات اینترفیس دریافت نشد؛ تغییر اعمال نشد.");
  return output.replace(/\r/g, "");
}
function safeSwitchport(output: string) {
  if (/^\s*(?:no switchport|ip address|ip unnumbered|switchport voice vlan|switchport private-vlan|switchport port-security|authentication|dot1x)\b/im.test(output)) fail("تنظیمات incompatible یا امنیتی پورت نیازمند بررسی دستی است.");
}
export function configuredAllowed(output: string): Set<number> {
  let result = vlanSet("all");
  for (const match of output.matchAll(/^\s*switchport trunk allowed vlan (?:(add|remove|except) )?([\w,\-]+)\s*$/gm)) {
    const values = vlanSet(match[2]);
    if (!match[1]) result = values;
    else if (match[1] === "add") values.forEach(v => result.add(v));
    else if (match[1] === "remove") values.forEach(v => result.delete(v));
    else result = new Set([...vlanSet("all")].filter(v => !values.has(v)));
  }
  return result;
}
function portSettings(p: Params, mode: "access" | "trunk") {
  if (mode === "access") return { commands: ["switchport mode access", `switchport access vlan ${oneVlan(p.accessVlanId)}`], check: (out: string) => {
    if (!/^\s*switchport mode access\s*$/m.test(out) || Number(out.match(/^\s*switchport access vlan (\d+)/m)?.[1] ?? 1) !== oneVlan(p.accessVlanId)) fail("VLAN یا حالت Access با مقدار درخواستی مطابقت ندارد.");
  } };
  const values = vlanSet(p.allowedVlans), native = oneVlan(p.nativeVlanId);
  return { commands: ["switchport mode trunk", `switchport trunk native vlan ${native}`, `switchport trunk allowed vlan ${String(p.allowedVlans).trim()}`], check: (out: string) => {
    if (!/^\s*switchport mode trunk\s*$/m.test(out) || Number(out.match(/^\s*switchport trunk native vlan (\d+)/m)?.[1] ?? 1) !== native || !same(configuredAllowed(out), values)) fail("حالت Trunk، Native VLAN یا فهرست VLAN با درخواست مطابقت ندارد.");
  } };
}
function activeVlans(ids: Set<number>): Spec {
  return read("switching.precheck.vlans", "show vlan brief", out => {
    const active = new Set([...out.matchAll(/^\s*(\d+)\s+\S+\s+active\b/gm)].map(m => Number(m[1])));
    for (const id of ids) if (!active.has(id)) fail(`VLAN ${id} فعال نیست؛ ابتدا آن را بسازید.`);
  });
}
function workflow(id: string, commands: string[], checks: Spec[]) {
  return [write(id + ".configure", "configure terminal"), ...commands.map((c, i) => write(id + ".write." + i, c)), write(id + ".end", "end"), ...checks];
}

export type ChannelAction = "create-access" | "create-trunk" | "add-members" | "remove-members" | "edit-access" | "edit-trunk" | "delete";
export function buildChannel(action: ChannelAction, p: Params): Spec[] {
  ack(p);
  const id = group(p), name = `Port-channel${id}`, creating = action.startsWith("create"), removing = action === "remove-members" || action === "delete";
  const ports = memberPorts(p.interfaces, creating ? 2 : 1);
  const mode = action.endsWith("access") ? "access" : action.endsWith("trunk") ? "trunk" : String(p.portMode);
  if (!removing && mode !== "access" && mode !== "trunk") fail("حالت پورت Access یا Trunk را انتخاب کنید.");
  const settings = removing ? null : portSettings(p, mode as "access" | "trunk");
  const lacp = String(p.lacpMode || "active");
  if (!/^(active|passive)$/.test(lacp)) fail("حالت LACP باید active یا passive باشد.");
  let existing: string[] = [], speed: string | undefined, duplex: string | undefined;
  const specs: Spec[] = [read("etherchannel.precheck.summary", "show etherchannel summary", out => {
    if (!/Group\s+Port-channel|no.*channel/i.test(out)) fail("خلاصه معتبر EtherChannel دریافت نشد.");
    const row = channelRow(out, id);
    if (creating && row) fail("Port-channel already exists؛ برای تغییر از عملیات ویرایش استفاده کنید.");
    if (!creating && (!row || row.protocol.toUpperCase() !== "LACP" || !row.flags.includes("S") || !row.members.length)) fail("گروه LACP لایه دو معتبر پیدا نشد؛ تغییر اعمال نشد.");
    existing = row?.members.map(m => m.name) ?? [];
    const requested = new Set(ports.map(v => v.toLowerCase()));
    if (action === "add-members" && (existing.some(v => requested.has(v.toLowerCase())) || existing.length + ports.length > 8)) fail("عضو تکراری است یا تعداد اعضا از ۸ بیشتر می‌شود.");
    if (removing && ports.some(v => !existing.some(e => e.toLowerCase() === v.toLowerCase()))) fail("پورت انتخاب‌شده عضو این گروه نیست.");
    if ((action.startsWith("edit") || action === "delete") && (existing.length !== ports.length || existing.some(v => !requested.has(v.toLowerCase())))) fail("برای ویرایش یا حذف، تمام اعضای واقعی گروه را انتخاب کنید.");
    if (action === "remove-members" && ports.length >= existing.length) fail("حذف آخرین عضو را با عملیات حذف گروه انجام دهید.");
  })];
  if (settings) {
    const vlans = mode === "access" ? new Set([oneVlan(p.accessVlanId)]) : new Set([oneVlan(p.nativeVlanId), ...(p.allowedVlans === "all" ? [] : vlanSet(p.allowedVlans))]);
    specs.push(activeVlans(vlans));
  }
  if (!creating) specs.push(read("etherchannel.precheck.group", `show running-config interface ${name}`, out => {
    const body = config(out, name); safeSwitchport(body);
    if (action === "add-members") settings!.check(body);
    if (action.startsWith("edit") && !new RegExp(`switchport mode ${mode}\\b`).test(body)) fail("تبدیل Access و Trunk روی گروه موجود باید جداگانه بررسی شود؛ حالت فعلی متفاوت است.");
  }));
  else specs.push(read("etherchannel.precheck.orphan", "show running-config", out => {
    if (!/^version\s|^hostname\s/m.test(out) || !/^end\s*$/m.test(out)) fail("پیکربندی کامل برای بررسی گروه خالی دریافت نشد.");
    if (new RegExp(`^interface ${escape(name)}\\s*$`, "mi").test(out)) fail("Port-channel خالی از قبل وجود دارد؛ آن را بازبینی یا حذف کنید.");
  }));
  if (creating || action === "add-members") specs.push(read("etherchannel.precheck.links", "show interfaces status", out => {
    const rows = parseCiscoInterfacesStatus(out);
    const expected = creating ? ports : [...existing, ...ports];
    const links = expected.map(port => rows.find(row => { try { return canonicalInterface(row.name).toLowerCase() === port.toLowerCase(); } catch { return false; } }));
    if (links.some(row => !row || ["err-disabled", "suspended", "monitoring"].includes(row.status))) fail("پورت واقعی وجود ندارد یا در وضعیت خطا/مانیتورینگ است.");
    const up = links.filter(row => row?.status === "connected");
    if (up.some(row => !row!.speed || !row!.duplex) || new Set(up.map(row => row!.speed?.replace(/^a-/, ""))).size > 1 || new Set(up.map(row => row!.duplex?.replace(/^a-/, ""))).size > 1) fail("سرعت یا Duplex واقعی لینک‌های فعال یکسان و قابل تشخیص نیست.");
  }));
  for (const [index, port] of ports.entries()) specs.push(read(`etherchannel.precheck.port.${index}`, `show running-config interface ${port}`, out => {
    const body = config(out, port); safeSwitchport(body);
    const member = body.match(/^\s*channel-group (\d+) mode (\S+)/m);
    if (creating || action === "add-members") { if (member) fail("پورت قبلاً عضو یک گروه است؛ incompatible."); }
    else if (Number(member?.[1]) !== id || !/^(active|passive)$/.test(member?.[2] ?? "")) fail("عضویت LACP پورت با انتخاب شما مطابقت ندارد.");
    if (creating || action === "add-members") {
      const s = body.match(/^\s*speed (\S+)/m)?.[1] ?? "auto", d = body.match(/^\s*duplex (\S+)/m)?.[1] ?? "auto";
      if ((speed && speed !== s) || (duplex && duplex !== d)) fail("تنظیم سرعت یا Duplex اعضای انتخابی یکسان نیست.");
      speed = s; duplex = d;
    }
  }));
  const commands: string[] = [];
  if (removing) {
    // Detached links remain administratively down: do not create parallel standalone loops.
    for (const port of ports) commands.push(`interface ${port}`, "shutdown", `no channel-group ${id}`, "exit");
    if (action === "delete") commands.push(`no interface ${name}`);
  } else {
    if (action !== "add-members") commands.push(`interface ${name}`, ...settings!.commands, "exit");
    for (const port of ports) commands.push(`interface ${port}`, ...settings!.commands,
      ...(creating || action === "add-members" ? [`channel-group ${id} mode ${lacp}`] : []), ...(p.enableMembers === true ? ["no shutdown"] : []), "exit");
  }
  const checks: Spec[] = ports.map((port, index) => read(`etherchannel.verify.port.${index}`, `show running-config interface ${port}`, out => {
    const body = config(out, port);
    if (removing) { if (/^\s*channel-group /m.test(body) || !/^\s*shutdown\s*$/m.test(body)) fail("حذف عضو یا خاموش‌ماندن پورت تأیید نشد."); }
    else {
      settings!.check(body);
      if (p.enableMembers === true && /^\s*shutdown\s*$/m.test(body)) fail("روشن‌شدن پورت انتخابی تأیید نشد.");
      if ((creating || action === "add-members") && !new RegExp(`^\\s*channel-group ${id} mode ${lacp}\\s*$`, "m").test(body)) fail("حالت LACP پورت با درخواست مطابقت ندارد.");
      if (!new RegExp(`^\\s*channel-group ${id} mode (active|passive)\\s*$`, "m").test(body)) fail("عضویت LACP درخواست‌شده روی پورت تأیید نشد.");
    }
  }));
  if (!removing) checks.push(read("etherchannel.verify.settings", `show running-config interface ${name}`, out => settings!.check(config(out, name))));
  const summaryCheck = read("etherchannel.verify.summary", "show etherchannel summary", out => {
    if (!/Group\s+Port-channel|no.*channel/i.test(out)) fail("خلاصه معتبر نتیجه دریافت نشد.");
    const row = channelRow(out, id);
    if (action === "delete") { if (row) fail("حذف Port-channel تأیید نشد."); return; }
    const expected = creating ? ports : action === "add-members" ? [...existing, ...ports] : action === "remove-members" ? existing.filter(v => !ports.some(p => p.toLowerCase() === v.toLowerCase())) : ports;
    if (!row || row.protocol.toUpperCase() !== "LACP" || !row.flags.includes("S") || !row.flags.includes("U") || row.members.length !== expected.length || expected.some(port => !row.members.some(m => m.name.toLowerCase() === port.toLowerCase() && m.flags === "P"))) {
      fail("تنظیمات ارسال شد ولی گروه یا همه اعضا Bundled نشده‌اند؛ سمت مقابل، لینک، سرعت و VLAN را بررسی کنید. خودکار تکرار نکنید.");
    }
  });
  summaryCheck.verificationAttempts = 5;
  checks.push(summaryCheck);
  return [...specs, ...workflow("etherchannel", commands, checks)];
}

export function buildTrunk(action: "configure" | "replace" | "add" | "remove", p: Params): Spec[] {
  ack(p);
  const name = canonicalInterface(p.interfaceName), selected = vlanSet(p.allowedVlans);
  if (action === "configure" && /^Port-channel/i.test(name)) fail("برای تنظیم حالت و Native گروه، از ویرایش EtherChannel ترانک استفاده کنید تا تمام اعضا هماهنگ بمانند.");
  if ((action === "add" || action === "remove") && !selected.size) fail("حداقل یک VLAN را مشخص کنید.");
  const settings = action === "configure" ? portSettings(p, "trunk") : null;
  let before = new Set<number>();
  const specs = [read("trunk.precheck.interface", `show running-config interface ${name}`, out => {
    const body = config(out, name); safeSwitchport(body);
    if (/^\s*channel-group /m.test(body)) fail("این پورت عضو EtherChannel است؛ به جای عضو، Port-channel را انتخاب کنید.");
    if (action !== "configure" && !/^\s*switchport mode trunk\s*$/m.test(body)) fail("اینترفیس در حالت Trunk ثابت نیست.");
    before = configuredAllowed(body);
  })];
  const commands = settings?.commands ?? [`switchport trunk allowed vlan ${action === "replace" ? "" : action + " "}${String(p.allowedVlans).trim()}`];
  if (settings) specs.push(activeVlans(new Set([oneVlan(p.nativeVlanId)])));
  return [...specs, ...workflow("trunk", [`interface ${name}`, ...commands, "exit"], [read("trunk.verify.interface", `show running-config interface ${name}`, out => {
    const body = config(out, name);
    if (!/^\s*switchport mode trunk\s*$/m.test(body)) fail("حالت Trunk پس از تغییر تأیید نشد.");
    if (settings) { settings.check(body); return; }
    const expected = action === "replace" ? selected : new Set(before);
    if (action === "add") selected.forEach(id => expected.add(id));
    if (action === "remove") selected.forEach(id => expected.delete(id));
    if (!same(configuredAllowed(body), expected)) fail("فهرست مؤثر VLANها با تغییر درخواستی مطابقت ندارد؛ نتیجه را بررسی کنید.");
  })])];
}

export function buildVlan(action: "create" | "rename" | "delete" | "access", p: Params): Spec[] {
  const id = oneVlan(p.vlanId), name = String(p.name ?? "").trim();
  if ([1, 1002, 1003, 1004, 1005].includes(id) && action !== "access") fail("VLAN پیش‌فرض یا رزروشده قابل تغییر با این عملیات نیست.");
  if ((action === "rename" || name) && !/^[A-Za-z0-9_\-]{1,32}$/.test(name)) fail("نام VLAN باید ۱ تا ۳۲ حرف لاتین، عدد، زیرخط یا خط تیره باشد.");
  if (action === "delete" || action === "access") ack(p);
  const specs: Spec[] = [read("vlan.precheck.database", "show vlan brief", out => {
    if (!/VLAN\s+Name\s+Status/.test(out)) fail("جدول معتبر VLAN دریافت نشد.");
    const row = out.match(new RegExp(`^\\s*${id}\\s+(\\S+)\\s+(\\S+)`, "m"));
    if (action === "create" && row) fail("VLAN از قبل وجود دارد؛ برای تغییر نام عملیات ویرایش را انتخاب کنید.");
    if (action !== "create" && (!row || row[2] !== "active")) fail("VLAN فعال وجود ندارد.");
  })];
  if (action !== "access") specs.push(read("vlan.precheck.vtp", "show vtp status", out => {
    if (!/VTP Operating Mode\s*:\s*(?:Transparent|Off)\b/i.test(out)) fail("برای جلوگیری از انتشار ناخواسته تغییر، این عملیات فقط در VTP Transparent/Off مجاز است.");
  }));
  const port = action === "access" ? canonicalInterface(p.interfaceName) : "";
  if (action === "access") specs.push(read("vlan.precheck.port", `show running-config interface ${port}`, out => {
    const body = config(out, port); safeSwitchport(body);
    if (/^\s*channel-group /m.test(body) || /^Port-channel/i.test(port)) fail("برای گروه EtherChannel از عملیات ویرایش گروه استفاده کنید.");
  }));
  if (action === "delete") specs.push(read("vlan.precheck.references", "show running-config", out => {
    if (!/^version\s|^hostname\s/m.test(out) || !/^end\s*$/m.test(out)) fail("پیکربندی کامل برای بررسی وابستگی دریافت نشد.");
    if (new RegExp(`^\\s*(?:switchport (?:access|voice|trunk native) vlan ${id}|interface Vlan${id})\\s*$`, "mi").test(out)) fail("VLAN در اینترفیس یا SVI استفاده شده است.");
    if (/^\s*(?:private-vlan|switchport private-vlan|monitor session .* vlan|remote-span)\b/mi.test(out)) fail("پیکربندی VLAN تخصصی یا SPAN نیازمند بررسی وابستگی دستی است؛ حذف انجام نشد.");
    for (const body of out.split(/^interface /m).slice(1)) if (/^\s*switchport mode trunk\s*$/m.test(body) && configuredAllowed(body).has(id)) fail("VLAN روی یک Trunk مجاز است؛ ابتدا وابستگی را حذف کنید.");
  }));
  const commands = action === "delete" ? [`no vlan ${id}`] : action === "access" ? [`interface ${port}`, "switchport mode access", `switchport access vlan ${id}`, "exit"] : [`vlan ${id}`, ...(name ? [`name ${name}`] : []), "exit"];
  const verify = action === "access" ? read("vlan.verify.port", `show running-config interface ${port}`, out => portSettings({ accessVlanId: id }, "access").check(config(out, port))) : read("vlan.verify.database", "show vlan brief", out => {
    if (!/VLAN\s+Name\s+Status/.test(out)) fail("جدول نتیجه VLAN معتبر نیست.");
    const row = out.match(new RegExp(`^\\s*${id}\\s+(\\S+)\\s+(\\S+)`, "m"));
    if (action === "delete" ? Boolean(row) : !row || row[2] !== "active" || (name && row[1] !== name)) fail("تغییر VLAN با مقدار درخواستی مطابقت ندارد.");
  });
  return [...specs, ...workflow("vlan", commands, [verify])];
}

export const SWITCHING_ACTIONS = [
  { slug: "create-access-etherchannel", title: "ساخت EtherChannel دسترسی", required: ["groupId", "interfaces", "accessVlanId", "acknowledgeDisruption"], optional: ["lacpMode", "enableMembers"], build: (p: Params) => buildChannel("create-access", p) },
  { slug: "create-trunk-etherchannel", title: "ساخت EtherChannel ترانک", required: ["groupId", "interfaces", "allowedVlans", "nativeVlanId", "acknowledgeDisruption"], optional: ["lacpMode", "enableMembers"], build: (p: Params) => buildChannel("create-trunk", p) },
  { slug: "add-etherchannel-members", title: "افزودن پورت به EtherChannel", required: ["groupId", "interfaces", "portMode", "acknowledgeDisruption"], optional: ["accessVlanId", "allowedVlans", "nativeVlanId", "lacpMode", "enableMembers"], build: (p: Params) => buildChannel("add-members", p) },
  { slug: "remove-etherchannel-members", title: "جداکردن پورت از EtherChannel", required: ["groupId", "interfaces", "acknowledgeDisruption"], optional: [], build: (p: Params) => buildChannel("remove-members", p) },
  { slug: "configure-access-etherchannel", title: "ویرایش VLAN گروه EtherChannel دسترسی", required: ["groupId", "interfaces", "accessVlanId", "acknowledgeDisruption"], optional: [], build: (p: Params) => buildChannel("edit-access", p) },
  { slug: "configure-trunk-etherchannel", title: "ویرایش VLAN و Native گروه EtherChannel ترانک", required: ["groupId", "interfaces", "allowedVlans", "nativeVlanId", "acknowledgeDisruption"], optional: [], build: (p: Params) => buildChannel("edit-trunk", p) },
  { slug: "delete-etherchannel", title: "حذف گروه EtherChannel", required: ["groupId", "interfaces", "acknowledgeDisruption"], optional: [], build: (p: Params) => buildChannel("delete", p) },
  { slug: "configure-trunk", title: "تنظیم پورت Trunk", required: ["interfaceName", "allowedVlans", "nativeVlanId", "acknowledgeDisruption"], optional: [], build: (p: Params) => buildTrunk("configure", p) },
  { slug: "configure-trunk-allowed-vlans", title: "جایگزینی فهرست VLANهای مجاز Trunk", required: ["interfaceName", "allowedVlans", "acknowledgeDisruption"], optional: [], build: (p: Params) => buildTrunk("replace", p) },
  { slug: "add-trunk-vlans", title: "افزودن VLAN به Trunk بدون حذف بقیه", required: ["interfaceName", "allowedVlans", "acknowledgeDisruption"], optional: [], build: (p: Params) => buildTrunk("add", p) },
  { slug: "remove-trunk-vlans", title: "حذف VLAN انتخابی از Trunk", required: ["interfaceName", "allowedVlans", "acknowledgeDisruption"], optional: [], build: (p: Params) => buildTrunk("remove", p) },
  { slug: "create-vlan", title: "ساخت VLAN", required: ["vlanId"], optional: ["name"], build: (p: Params) => buildVlan("create", p) },
  { slug: "rename-vlan", title: "ویرایش نام VLAN", required: ["vlanId", "name"], optional: [], build: (p: Params) => buildVlan("rename", p) },
  { slug: "delete-vlan", title: "حذف VLAN بدون وابستگی", required: ["vlanId", "acknowledgeDisruption"], optional: [], build: (p: Params) => buildVlan("delete", p) },
  { slug: "assign-access-vlan", title: "تنظیم VLAN پورت دسترسی", required: ["interfaceName", "vlanId", "acknowledgeDisruption"], optional: [], build: (p: Params) => buildVlan("access", p) },
] as const;
