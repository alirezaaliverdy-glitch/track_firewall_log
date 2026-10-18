import { useEffect, useRef, useState } from "react";
import { HardDrive, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { collaborationApi } from "./communityApi";
import { collaborationError } from "./TaskBoard";

type Policy = { enabled: boolean; discussionDays: number; closedTicketDays: number; maxMessages: number };
type Storage = { policy: Policy; usedBytes: number; workspaceFileLimit: number };
export function RetentionDialog({ isFa, onClose }: { isFa: boolean; onClose: () => void }) {
  const t = (fa: string, en: string) => isFa ? fa : en, { user } = useAuth(), dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Storage>(), [policy, setPolicy] = useState<Policy>(), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => { dialog.current?.showModal(); const abort = new AbortController(); void collaborationApi<Storage>("/retention", { signal: abort.signal }).then(result => { setData(result); setPolicy(result.policy); }).catch(e => { if (!abort.signal.aborted) setError(collaborationError(e, t)); }); return () => abort.abort(); }, []);
  return <dialog ref={dialog} className="hub-dialog community-hub" dir={isFa ? "rtl" : "ltr"} aria-labelledby="retention-title" onCancel={e => { if (busy) e.preventDefault(); else onClose(); }}>
    <header><HardDrive/><h2 id="retention-title">{t("فضا و نگهداری پیام‌ها", "Storage & retention")}</h2><button disabled={busy} onClick={onClose} aria-label={t("بستن", "Close")}><X/></button></header>
    <p className="hub-dialog__privacy">{t("هر فایل تا ۵۰ مگابایت؛ سه فایل در هر پیام. پاکسازی هر ساعت، در دسته‌های محدود انجام می‌شود و برگشت‌پذیر نیست. تیکت باز، تسک و ممیزی پاک نمی‌شوند.", "50 MiB per file, three files per message. Irreversible cleanup runs hourly in bounded batches. Open tickets, tasks and audit records are protected.")}</p>
    {data && <p>{t("فضای پیوست‌های این مجموعه", "Workspace attachments")}: {Math.ceil(data.usedBytes / 1048576)} / {Math.round(data.workspaceFileLimit / 1048576)} MiB</p>}
    {policy && <form onSubmit={async e => { e.preventDefault(); if (busy || user?.role !== "admin") return; setBusy(true); setError(""); setNotice(""); try { await collaborationApi("/retention", { method: "PATCH", body: policy }); setNotice(t("سیاست ذخیره شد؛ از پاکسازی بعدی اعمال می‌شود.", "Saved. Applies from the next cleanup.")); } catch (e) { setError(collaborationError(e, t)); } finally { setBusy(false); } }}>
      <label style={{ display: "flex", alignItems: "center", gap: 10 }}><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={policy.enabled} disabled={busy || user?.role !== "admin"} onChange={e => setPolicy({ ...policy, enabled: e.target.checked })}/>{t("پاکسازی خودکار فعال باشد", "Enable automatic cleanup")}</label>
      {([ ["discussionDays", t("عمر پیام گفتگو (روز)", "Discussion message age (days)")], ["closedTicketDays", t("عمر پیام تیکت بسته (روز)", "Closed-ticket message age (days)")], ["maxMessages", t("حداکثر پیام در هر گفتگو / تیکت بسته", "Maximum messages per discussion / closed ticket")] ] as const).map(([key, label]) => <label key={key}>{label}<input type="number" required min={key === "maxMessages" ? 100 : 7} max={key === "maxMessages" ? 20000 : 365} value={policy[key]} disabled={busy || user?.role !== "admin"} onChange={e => setPolicy({ ...policy, [key]: Number(e.target.value) })}/></label>)}
      <footer><button type="button" disabled={busy} onClick={onClose}>{t("بستن", "Close")}</button>{user?.role === "admin" && <button className="hub-primary" disabled={busy} type="submit">{t("ذخیره سیاست", "Save policy")}</button>}</footer>
    </form>}
    {error && <p className="hub-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </dialog>;
}
