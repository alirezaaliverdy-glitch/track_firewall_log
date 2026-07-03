import { useEffect, useMemo, useState } from "react";
import { Bot, Search, ShieldCheck } from "lucide-react";
import { listDevices, type Device } from "@/lib/devices";
import { createCatalogAction, proposeWithAi, searchCommands, type CatalogItem } from "@/lib/commandCatalog";
import { publishActionPlanCreated, reviewInActionCenter } from "@/lib/actionPlanHandoff";

const vendorOf = (device?: Device) => device?.type === "linux_edge" ? "linux" : device?.type === "generic_firewall" || device?.type === "generic_syslog_source" ? "generic" : device?.type ?? "";
const complete = (item: CatalogItem, values: Record<string, string>) => item.requiredParams.every((field) => String(values[field.key] ?? item.defaultParams[field.key] ?? "").trim());

export default function CommandCatalogPanel() {
  const [devices, setDevices] = useState<Device[]>([]); const [deviceId, setDeviceId] = useState("");
  const [q, setQ] = useState(""); const [vendor, setVendor] = useState(""); const [category, setCategory] = useState(""); const [riskLevel, setRisk] = useState("");
  const [readOnly, setReadOnly] = useState(false); const [executable, setExecutable] = useState(false); const [items, setItems] = useState<CatalogItem[]>([]);
  const [params, setParams] = useState<Record<string, Record<string, string>>>({}); const [message, setMessage] = useState(""); const [aiText, setAiText] = useState(""); const [loading, setLoading] = useState(false);
  const selected = useMemo(() => devices.find((device) => device.id === deviceId), [devices, deviceId]);
  useEffect(() => { void listDevices().then(setDevices).catch((error) => setMessage(error.message)); }, []);
  useEffect(() => {
    setLoading(true);
    const handle = window.setTimeout(() => void searchCommands({ q, deviceId, vendor: deviceId ? "" : vendor, category, riskLevel, readOnly: readOnly ? "true" : "", executable: executable ? "true" : "" }).then((result) => setItems(result.items)).catch((error) => setMessage(error.message)).finally(() => setLoading(false)), 180);
    return () => window.clearTimeout(handle);
  }, [q, deviceId, vendor, category, riskLevel, readOnly, executable]);
  useEffect(() => { if (selected) setVendor(vendorOf(selected)); }, [selected]);
  const categories = [...new Set(items.map((item) => item.category))];
  const create = async (item: CatalogItem) => {
    if (!deviceId) return setMessage("ابتدا دستگاه هدف را انتخاب کنید.");
    if (!complete(item, params[item.id] ?? {})) return setMessage("اطلاعات الزامی این دستور را کامل کنید.");
    try { const plan = await createCatalogAction(item.id, deviceId, params[item.id] ?? {}); setMessage(item.implementationState === "manualOnly" ? "برنامه بررسی دستی ساخته شد و امکان اجرای خودکار ندارد." : "برنامه اجرا ساخته شد؛ مرکز عملیات برای بازبینی باز می‌شود."); const url = new URL(window.location.href); url.searchParams.set("selected", plan.id); url.hash = "action-center"; window.history.pushState({}, "", url); publishActionPlanCreated(plan.id); window.setTimeout(reviewInActionCenter, 50); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ساخت برنامه ناموفق بود."); }
  };
  const askAi = async () => { if (!aiText.trim()) return; try { await proposeWithAi(aiText, vendor || "generic", deviceId || undefined); setMessage("پیشنهاد هوش مصنوعی فقط به‌صورت برنامه پیشنهادی ساخته شد و اجرا نشده است."); } catch (error) { setMessage(error instanceof Error ? error.message : "ساخت پیشنهاد ناموفق بود."); } };
  return <section dir="rtl" className="mb-5 rounded-2xl border border-cyan-900/60 bg-slate-950/80 p-5 text-right text-slate-100">
    <div className="mb-4 flex items-center gap-2"><ShieldCheck className="text-cyan-400"/><div><h2 className="text-xl font-bold">دستورات آماده</h2><p className="text-sm text-slate-400">فقط دستورهای واقعی و سازگار با دستگاه انتخاب‌شده نمایش داده می‌شوند.</p></div></div>
    <div className="grid gap-3 md:grid-cols-4"><select value={deviceId} onChange={(event)=>setDeviceId(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 p-2"><option value="">انتخاب دستگاه</option>{devices.map((device)=><option key={device.id} value={device.id}>{device.name}</option>)}</select><div className="relative"><Search className="absolute right-2 top-2.5 h-4 w-4 text-slate-500"/><input value={q} onChange={(event)=>setQ(event.target.value)} placeholder="جستجوی دستور فارسی" className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-2 pr-8"/></div><select value={vendor} disabled={Boolean(deviceId)} onChange={(event)=>setVendor(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 p-2 disabled:opacity-60"><option value="">همه وندورها</option>{["linux","mikrotik","fortigate","cisco","pfsense","generic"].map((value)=><option key={value}>{value}</option>)}</select><select value={riskLevel} onChange={(event)=>setRisk(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 p-2"><option value="">همه ریسک‌ها</option><option value="low">کم</option><option value="medium">متوسط</option><option value="high">زیاد</option><option value="critical">بحرانی</option></select></div>
    <div className="my-3 flex flex-wrap gap-4 text-sm"><label><input type="checkbox" checked={readOnly} onChange={(event)=>setReadOnly(event.target.checked)}/> فقط خواندنی</label><label><input type="checkbox" checked={executable} onChange={(event)=>setExecutable(event.target.checked)}/> اجراپذیر</label>{categories.length>0&&<select value={category} onChange={(event)=>setCategory(event.target.value)} className="bg-slate-900"><option value="">همه دسته‌ها</option>{categories.map((value)=><option key={value}>{value}</option>)}</select>}</div>
    {message&&<p className="mb-3 rounded-lg bg-cyan-950/50 p-3 text-sm text-cyan-200">{message}</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => { const values=params[item.id]??{}; const ready=complete(item,values); return <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><div className="flex justify-between gap-2"><h3 className="font-bold">{item.titleFa}</h3><span className={`text-xs ${item.implementationState==="implemented"?"text-emerald-400":"text-amber-400"}`}>{item.uiHints.badgeFa}</span></div><p className="mt-2 text-sm text-slate-400">{item.descriptionFa}</p>{item.requiredParams.map((field)=><label key={field.key} className="mt-2 block text-xs text-slate-300">{field.labelFa}<input placeholder={field.placeholderFa} value={values[field.key]??""} onChange={(event)=>setParams((current)=>({...current,[item.id]:{...current[item.id],[field.key]:event.target.value}}))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm"/><span className="mt-1 block text-slate-500">{field.helpFa}</span></label>)}<button onClick={()=>void create(item)} className="mt-3 rounded-lg bg-cyan-700 px-3 py-2 text-sm hover:bg-cyan-600">{item.implementationState==="manualOnly"?"ساخت برنامه بررسی دستی":ready?"ساخت برنامه اجرا":"تکمیل اطلاعات"}</button></article>; })}</div>
    {!loading&&items.length===0&&<div className="mt-4 rounded-xl border border-dashed border-slate-700 p-4"><p>دستور قابل استفاده‌ای پیدا نشد. می‌توانید یک پیشنهاد سفارشی و غیرخودکار بسازید.</p><div className="mt-2 flex gap-2"><input value={aiText} onChange={(event)=>setAiText(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 p-2" placeholder="درخواست عملیاتی شما"/><button onClick={()=>void askAi()} className="flex items-center gap-1 rounded bg-violet-700 px-3"><Bot className="h-4 w-4"/> ساخت با هوش مصنوعی</button></div></div>}
  </section>;
}
