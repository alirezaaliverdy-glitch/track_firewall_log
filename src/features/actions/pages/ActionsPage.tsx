import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActionCenterWorkspace } from "@/components/actions/ActionCenterWorkspace";
import CommandCatalogPanel from "@/components/commands/CommandCatalogPanel";
import type { RouteComponentProps } from "@/routes/appRoutes";

export default function ActionsPage({ params }: RouteComponentProps) {
  const { i18n } = useTranslation();
  const isFa = i18n.language?.startsWith("fa") ?? false;
  const [catalogOpen, setCatalogOpen] = useState(false);

  return (
    <section className="page-stack">
      <PageHeader
        title={isFa ? "مرکز اقدامات" : "Action Center"}
        eyebrow="ActionPlan"
        description={isFa ? "پیش‌نمایش، تأیید کاربر، PolicyGuard و اجرای واقعی Connector در یک چرخه شفاف." : "Preview, user confirmation, PolicyGuard, and real connector execution in one transparent lifecycle."}
        actions={<button className="primary-button" type="button" onClick={() => setCatalogOpen(!catalogOpen)}>{isFa ? "ساخت ActionPlan" : "Create ActionPlan"}</button>}
      />
      {catalogOpen && <section id="action-library" className="content-panel action-create-panel"><div className="action-create-panel__header"><div><h2>{isFa ? "کتابخانه اقدام" : "Action library"}</h2><p>{isFa ? "یک فرمان پشتیبانی‌شده را انتخاب کنید تا ActionPlan ساخته شود." : "Choose a supported catalog command to create an ActionPlan."}</p></div><button className="text-button" type="button" onClick={() => setCatalogOpen(false)}>{isFa ? "بستن" : "Close"}</button></div><CommandCatalogPanel /></section>}
      <ActionCenterWorkspace initialActionId={params.actionId} onCreate={() => setCatalogOpen(true)} />
    </section>
  );
}
