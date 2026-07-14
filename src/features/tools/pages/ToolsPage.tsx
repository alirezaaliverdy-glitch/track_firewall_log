import { PageHeader } from "@/components/ui/PageHeader";

export default function ToolsPage() {
  const isNetworkCheck = window.location.pathname === "/tools/network-check";
  return (
    <section className="page-stack">
      <PageHeader
        title={isNetworkCheck ? "تست سریع شبکه" : "ابزارهای تشخیصی"}
        eyebrow="Diagnostics"
        description="این مسیر برای آماده‌سازی ابزارهای تشخیصی Task 19.2 است؛ تا قبل از فعال‌شدن Workerها هیچ اسکن یا فراخوانی خارجی اجرا نمی‌شود."
        actions={<a className="secondary-link" href="/dashboard">بازگشت به داشبورد</a>}
      />
      <section className="content-panel">
        <h2>{isNetworkCheck ? "Network Quick Check" : "دامنه یا IP"}</h2>
        <p>ورودی تشخیص، Check-Host، Nmap و مانیتورهای زمان‌بندی‌شده در Milestoneهای بعدی فعال می‌شوند. این صفحه فعلا یک مقصد پایدار و غیر اجرایی برای کنترل‌های داشبورد است.</p>
        <div className="button-row">
          <a className="primary-link" href="/assets/devices/new">ثبت دستگاه جدید</a>
          <a className="secondary-link" href="/assets/devices">مشاهده دستگاه‌ها</a>
        </div>
      </section>
    </section>
  );
}
