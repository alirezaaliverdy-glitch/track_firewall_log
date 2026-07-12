import { PageHeader } from "@/components/ui/PageHeader";
import ActionCenterPanel from "@/components/actions/ActionCenterPanel";
import CommandCatalogPanel from "@/components/commands/CommandCatalogPanel";

export default function ActionsPage() {
  return (
    <section className="page-stack">
      <PageHeader title="اقدامات" eyebrow="ActionPlan" description="Preview، تایید کاربر، PolicyGuard و اجرای واقعی connector در همین مسیر باقی می ماند." />
      <ActionCenterPanel />
      <details className="content-panel">
        <summary>کتابخانه اکشن</summary>
        <div className="mt-4"><CommandCatalogPanel /></div>
      </details>
    </section>
  );
}
