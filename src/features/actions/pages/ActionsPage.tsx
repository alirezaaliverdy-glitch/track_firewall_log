import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Plus, ShieldCheck } from "lucide-react";
import { ActionCenterWorkspace } from "@/components/actions/ActionCenterWorkspace";
import CommandCatalogPanel from "@/components/commands/CommandCatalogPanel";
import type { RouteComponentProps } from "@/routes/appRoutes";
import "./ActionsPage.css";

export default function ActionsPage({ params }: RouteComponentProps) {
  const { i18n } = useTranslation();
  const isFa = i18n.language?.startsWith("fa") ?? false;
  const [catalogOpen, setCatalogOpen] = useState(false);

  return (
    <section className="page-stack operations-center-page">
      <header className="operations-hero">
        <div className="operations-hero__copy">
          <span className="operations-hero__eyebrow"><ShieldCheck aria-hidden="true" /> {isFa ? "کنسول اجرای کنترل‌شده" : "Controlled operations console"}</span>
          <h1>{isFa ? "مرکز عملیات" : "Action Center"}</h1>
          <p>{isFa ? "عملیات را بسازید، فرمان‌های تولیدشده را ببینید و پس از تأیید صریح از کانکتور واقعی اجرا کنید." : "Build an operation, review generated commands, then explicitly confirm execution through the registered connector."}</p>
        </div>
        <div className="operations-hero__actions">
          <button className="primary-button" type="button" onClick={() => { setCatalogOpen(false); document.querySelector('.operator-run-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}><Plus aria-hidden="true" />{isFa ? "عملیات جدید" : "New action"}</button>
          <button className="secondary-button" type="button" aria-expanded={catalogOpen} onClick={() => setCatalogOpen(!catalogOpen)}><BookOpen aria-hidden="true" />{isFa ? "کتابخانه عملیات" : "Action library"}</button>
        </div>
        <span className="operations-hero__safety">{isFa ? "پیش‌نمایش امن · اجرا فقط با تأیید شما" : "Safe preview · execution only after confirmation"}</span>
      </header>
      {catalogOpen && <section id="action-library" className="content-panel action-create-panel"><div className="action-create-panel__header"><div><h2>{isFa ? "کتابخانه عملیات" : "Action library"}</h2><p>{isFa ? "برای جریان‌های پیشرفته، کاتالوگ کامل ActionPlan را باز کنید." : "Use the complete ActionPlan catalog for advanced workflows."}</p></div><button className="text-button" type="button" onClick={() => setCatalogOpen(false)}>{isFa ? "بستن" : "Close"}</button></div><CommandCatalogPanel /></section>}
      <ActionCenterWorkspace initialActionPlanId={params.actionId} onCreate={() => setCatalogOpen(true)} />
    </section>
  );
}
