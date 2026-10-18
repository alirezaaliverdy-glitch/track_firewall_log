import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { createCompany } from "@/lib/companies";
import { useAuth } from "@/context/AuthContext";
import { cameraErrorMessage, listCameraCompanies, type CameraCompany } from "@/lib/cameras";
import { CameraDialog } from "./CameraDialog";

export function CameraCompanyDialog({ isFa, title, onClose, onSelected, excludeCompanyId }: { isFa: boolean; title: string; onClose: () => void; onSelected: (company: CameraCompany) => void; excludeCompanyId?: string }) {
  const t = (fa: string, en: string) => isFa ? fa : en, { user } = useAuth();
  const [companies, setCompanies] = useState<CameraCompany[]>([]), [selected, setSelected] = useState(""), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [create, setCreate] = useState(false), [name, setName] = useState(""), [code, setCode] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; void listCameraCompanies().then(data => { if (alive) { const eligible = data.companies.filter(company => company.id !== excludeCompanyId); setCompanies(eligible); setSelected(eligible[0]?.id ?? ""); } }).catch(e => { if (alive) setError(cameraErrorMessage(e, isFa)); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [isFa, excludeCompanyId]);
  return <CameraDialog title={title} onClose={() => { if (!busy) onClose(); }}><form className="camera-form" onSubmit={async e => { e.preventDefault(); if (busy) return;
    if (!create) { const company = companies.find(c => c.id === selected); if (company) onSelected(company); return; }
    setBusy(true); setError(""); try { const company = await createCompany({ name, code }); onSelected({ ...company, cameraCount: 0, nvrCount: 0 }); } catch { setError(t("ثبت شرکت انجام نشد؛ نام و کد یکتا را بررسی کن.", "Company was not saved. Check the name and unique code.")); } finally { setBusy(false); }
  }}><p className="camera-hint"><Building2 size={18}/>{t("دستگاه به شرکت انتخاب‌شده تعلق می‌گیرد؛ IP، رمز و مسیر VPN آن بدون تغییر می‌ماند.", "The selected company owns this device. Its IP, credentials and VPN route are kept.")}</p>
    {loading ? <p role="status">{t("دریافت شرکت‌ها…", "Loading companies…")}</p> : <>
    {!create && <label>{t("شرکت مقصد", "Destination company")}<select required value={selected} onChange={e => setSelected(e.target.value)}><option value="" disabled>{t("انتخاب شرکت", "Choose company")}</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name} · {company.code}</option>)}</select></label>}
    {user?.role === "admin" && <button className="camera-button camera-button--quiet" type="button" onClick={() => setCreate(!create)}>{create ? t("انتخاب شرکت موجود", "Choose an existing company") : t("ساخت شرکت جدید", "Create a company")}</button>}
    {create && <><label>{t("نام شرکت", "Company name")}<input required value={name} maxLength={160} onChange={e => setName(e.target.value)}/></label><label>{t("کد یکتا", "Unique code")}<input required dir="ltr" value={code} maxLength={40} onChange={e => setCode(e.target.value)}/></label></>}
    {!companies.length && !create && <p className="camera-hint">{t("شرکتی ثبت نشده؛ مدیر می‌تواند همین‌جا شرکت بسازد.", "No companies yet. An administrator can create one here.")}</p>}
    <button className="camera-button camera-button--primary" disabled={busy || !create && !selected}>{t("ادامه", "Continue")}</button></>}
    {error && <p className="camera-alert" role="alert">{error}</p>}
  </form></CameraDialog>;
}
