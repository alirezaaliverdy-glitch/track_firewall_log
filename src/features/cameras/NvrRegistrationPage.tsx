import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AccessLink as Link } from "@/components/auth/AccessLink";
import { useTranslation } from "react-i18next";
import { Server } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { CameraCompanyDialog } from "./CameraCompanyDialog";
import { CameraAddDialog } from "./CameraAddDialog";
import type { CameraCompany } from "@/lib/cameras";
import "./CamerasPage.css";
export default function NvrRegistrationPage() {
  const { i18n } = useTranslation(), { user } = useAuth(), navigate = useNavigate(), isFa = i18n.language.startsWith("fa"), t = (fa: string, en: string) => isFa ? fa : en;
  const [company, setCompany] = useState<CameraCompany>(), [choosing, setChoosing] = useState(true), [adding, setAdding] = useState(false);
  return <section className="cameras-page"><header className="cameras-page__heading"><div><span className="cameras-page__eyebrow">EOSNET / NVR</span><h1>{t("ثبت تجهیز ضبط‌کننده", "Register a recorder")}</h1><p>{t("شرکت ← اتصال و حساب دستگاه ← پایش سنسورها", "Company → device connection → sensor monitoring")}</p></div><Server size={35}/></header>
    <p className="camera-hint">{t("NVR به‌عنوان دارایی مستقل ثبت می‌شود. رمزگذاری اطلاعات ورود، مسیر VPN و انتخاب پروتکل هارد از همان فضای کاری تجهیز مدیریت می‌شود.", "NVRs are registered as independent assets. Encrypted credentials, VPN routing and disk adapters are managed in the recorder workspace.")}</p>
    <div className="camera-heading-actions"><Link className="camera-button" to="/assets/cameras">{t("بازگشت به دوربین‌ها", "Back to cameras")}</Link>{user?.role !== "viewer" && <button className="camera-button camera-button--primary" onClick={() => { if (company) setAdding(true); else setChoosing(true); }}>{t("افزودن NVR", "Add NVR")}</button>}</div>
    {choosing && user?.role !== "viewer" && <CameraCompanyDialog isFa={isFa} title={t("شرکت تجهیز NVR", "NVR company")} onClose={() => setChoosing(false)} onSelected={company => { setCompany(company); setChoosing(false); setAdding(true); }}/>}
    {adding && company && <CameraAddDialog isFa={isFa} companyId={company.id} initialKind="nvr" onClose={() => setAdding(false)} onSaved={devices => { const nvr = devices.find(device => device.kind === "nvr"); if (nvr) navigate(`/assets/cameras/recorders/${encodeURIComponent(nvr.id)}`); }}/>}
  </section>;
}
