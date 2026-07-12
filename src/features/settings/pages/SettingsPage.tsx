import { PageHeader } from "@/components/ui/PageHeader";
import { PlannedState } from "@/components/ui/PlannedState";

export default function SettingsPage() {
  return (
    <section className="page-stack">
      <PageHeader title="تنظیمات" eyebrow="Settings" description="تنظیمات تولیدی در این milestone تغییر نمی کنند." />
      <PlannedState title="تنظیمات پلتفرم" description="این صفحه فعلا فقط مسیر استاندارد دارد. هیچ secret یا env در UI نمایش داده نمی شود." />
    </section>
  );
}
