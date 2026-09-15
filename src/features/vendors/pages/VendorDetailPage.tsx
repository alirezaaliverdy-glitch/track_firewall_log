import { useEffect, useState } from "react";
import type { RouteComponentProps } from "@/routes/appRoutes";
import { PageHeader } from "@/components/ui/PageHeader";
import { getVendorDetail, type VendorDetail } from "@/lib/vendors";
import { listDevices, type Device } from "@/lib/devices";
import { Link } from "react-router-dom";

export default function VendorDetailPage({ params }: RouteComponentProps) {
  const vendorKey = params.vendorKey || "cisco";
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([getVendorDetail(vendorKey), listDevices()])
      .then(([detail, allDevices]) => {
        setVendor(detail);
        setDevices(allDevices.filter((item) => `${item.vendor} ${item.type}`.toLowerCase().includes(vendorKey.toLowerCase())));
      })
      .catch((failure: Error) => setError(failure.message));
  }, [vendorKey]);
  if (error) return <section className="page-stack"><PageHeader title={vendorKey} eyebrow="Vendor" /><div className="state-card is-error">{error}</div></section>;
  if (!vendor) return <section className="page-stack"><PageHeader title={vendorKey} eyebrow="Vendor" /><div className="state-card">در حال دریافت وضعیت وندور...</div></section>;
  const implemented = vendor.capabilities.filter((item) => item.implementationState === "implemented");
  const vendorOnboardingLabel: Record<string, string> = {
    cisco: "ثبت دستگاه Cisco",
    fortigate: "ثبت دستگاه FortiGate",
    mikrotik: "ثبت دستگاه MikroTik",
    linux: "ثبت سرور Linux"
  };
  const onboardingLabel = vendorOnboardingLabel[vendorKey.toLowerCase()] ?? `ثبت دستگاه ${vendor.titleFa || vendor.titleEn}`;
  return (
    <section className="page-stack">
      <PageHeader title={vendor.titleFa || vendor.titleEn} eyebrow="مدیریت وندور" description={vendor.description} actions={<Link className="primary-link" to={`/assets/vendors/${vendorKey}/devices/new`}>{onboardingLabel}</Link>} />
      <div className="summary-grid"><article><span>دستگاه ثبت‌شده</span><strong>{devices.length}</strong></article><article><span>قابلیت پیاده‌شده</span><strong>{implemented.length}</strong></article><article><span>وضعیت</span><strong>{vendor.implementationState}</strong></article></div>
      <section className="content-panel"><h2>دستگاه‌ها</h2>{devices.length ? devices.map((item) => <Link key={item.id} className="list-row" to={`/assets/devices/${item.id}`}>{item.name}<span>{item.status}</span></Link>) : <div className="state-card"><p>برای این وندور هنوز دستگاهی ثبت نشده است.</p><Link className="primary-link" to={`/assets/vendors/${vendorKey}/devices/new`}>{onboardingLabel}</Link></div>}</section>
      <section className="content-panel"><h2>قابلیت‌های قابل استفاده</h2><ul className="plain-list">{implemented.slice(0, 12).map((item) => <li key={item.key}>{item.titleFa || item.titleEn}<span>{item.mode === "read" ? "خواندنی" : "کنترل‌شده"}</span></li>)}</ul>{implemented.length === 0 ? <p>هیچ قابلیت اجرایی تاییدشده‌ای وجود ندارد.</p> : null}</section>
    </section>
  );
}
