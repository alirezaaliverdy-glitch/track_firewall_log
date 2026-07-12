import { PageHeader } from "@/components/ui/PageHeader";
import AiSecurityAssistantPanel from "@/components/ai/AiSecurityAssistantPanel";

export default function AssistantPage() {
  return (
    <section className="page-stack">
      <PageHeader title="دستیار هوشمند" eyebrow="AI Workflow" description="دستیار فقط پیشنهاد، guided workflow یا ActionPlan قابل بازبینی می سازد؛ اجرای مستقیم ندارد." />
      <AiSecurityAssistantPanel />
    </section>
  );
}
