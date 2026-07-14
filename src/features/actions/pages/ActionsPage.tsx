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
        title={isFa ? "مرکز عملیات" : "Action Center"}
        eyebrow="Operator Console"
        description={isFa ? "دستگاه، اعتبارنامه و عملیات را انتخاب کنید؛ سپس مستقیماً از طریق Connector اجرا کنید." : "Select a device, credential, and action, then run it directly through the connector."}
        actions={<button className="secondary-button" type="button" onClick={() => setCatalogOpen(!catalogOpen)}>{isFa ? "کتابخانه کامل" : "Full action library"}</button>}
      />
      {catalogOpen && <section id="action-library" className="content-panel action-create-panel"><div className="action-create-panel__header"><div><h2>{isFa ? "کتابخانه عملیات" : "Action library"}</h2><p>{isFa ? "برای جریان‌های پیشرفته، کاتالوگ کامل ActionPlan را باز کنید." : "Use the complete ActionPlan catalog for advanced workflows."}</p></div><button className="text-button" type="button" onClick={() => setCatalogOpen(false)}>{isFa ? "بستن" : "Close"}</button></div><CommandCatalogPanel /></section>}
      <ActionCenterWorkspace initialActionPlanId={params.actionId} onCreate={() => setCatalogOpen(true)} />
    </section>
  );
}
