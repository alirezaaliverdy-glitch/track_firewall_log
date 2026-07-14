import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCiscoDevices, getVendorDetail, listVendors, type VendorDetail, type VendorSummary } from "@/lib/vendors";
import { Link, useLocation } from "react-router-dom";

type CiscoDeviceResponse = { data: unknown[]; warnings: string[]; meta: Record<string, unknown> };

const stateFa: Record<string, string> = {
  implemented: "فعال",
  partial: "محدود",
  planned: "در صف توسعه",
  unsupported: "پشتیبانی نمی‌شود"
};

const domainFa: Record<string, string> = {
  system: "سیستم",
  inventory: "موجودی",
  interface: "اینترفیس",
  switching: "سوئیچینگ",
  routing: "مسیریابی",
  security: "امنیت"
};

const vendorPurposeFa: Record<string, string> = {
  linux: "سرورهای Linux با SSH خواندنی و اقدام‌های کنترل‌شده.",
  mikrotik: "RouterOS با اقدام‌های SSH ثبت‌شده و کنترل‌شده.",
  fortigate: "FortiGate با کشف خواندنی و بخشی از اقدام‌های مدیریت‌شده.",
  cisco: "Cisco با تشخیص خانواده پلتفرم و خواندن امن IOS-XE.",
  pfsense: "فعلا فقط مسیر آینده و بدون اجرای واقعی.",
  juniper: "فعلا فقط مسیر آینده و بدون اجرای واقعی.",
  paloalto: "فعلا فقط مسیر آینده و بدون اجرای واقعی.",
  windows: "فعلا فقط مسیر آینده و بدون اجرای واقعی.",
  generic: "منبع عمومی برای داده یا لاگ، بدون اقدام واقعی."
};

const vendorOnboardingLabelFa: Record<string, string> = {
  cisco: "ثبت دستگاه Cisco",
  fortigate: "ثبت دستگاه FortiGate",
  mikrotik: "ثبت دستگاه MikroTik",
  linux: "ثبت سرور Linux"
};

export default function CiscoOverviewPage() {
  const location = useLocation();
  const isCiscoRoute = location.pathname.includes("/assets/vendors/cisco");
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [devices, setDevices] = useState<CiscoDeviceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listVendors(), getVendorDetail("cisco"), getCiscoDevices()])
      .then(([vendorList, ciscoDetail, ciscoDevices]) => {
        setVendors(vendorList.vendors);
        setVendor(ciscoDetail);
        setDevices(ciscoDevices);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const grouped = useMemo(() => {
    const groups = new Map<string, NonNullable<VendorDetail["capabilities"]>>();
    for (const item of vendor?.capabilities ?? []) {
      const key = item.domain || "other";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, [vendor]);

  const implementedReads = vendor?.capabilities.filter((item) => item.mode === "read" && item.implementationState === "implemented").length ?? 0;
  const mutations = vendor?.capabilities.filter((item) => item.mode === "mutate") ?? [];
  const planned = vendor?.capabilities.filter((item) => item.implementationState !== "implemented") ?? [];
  const ciscoDeviceCount = devices?.data.length ?? 0;

  if (error) return <section className="page-stack"><PageHeader title="وندورها" eyebrow="Vendor management" /><div className="state-card is-error">{error}</div></section>;
  if (!vendor) return <section className="page-stack"><PageHeader title="وندورها" eyebrow="Vendor management" /><div className="state-card">در حال دریافت وضعیت وندورها...</div></section>;

  if (!isCiscoRoute) {
    return (
      <section className="page-stack">
        <PageHeader title="وندورها" eyebrow="مدیریت قابلیت‌ها" description="نمای خلاصه وندورها، Connectorها و سطح آمادگی هر مسیر عملیاتی." actions={<Link className="primary-link" to="/assets/devices/new">ثبت دستگاه</Link>} />
        <div className="content-grid">
          {vendors.map((item) => (
            <section key={item.key} className="content-panel">
              <h2>{item.titleFa || item.titleEn}</h2>
              <dl className="detail-list">
                <dt>وضعیت</dt><dd>{stateFa[item.implementationState] ?? item.implementationState}</dd>
                <dt>Connector</dt><dd>{item.connectorTypes.join("، ") || "ندارد"}</dd>
                <dt>کاربرد</dt><dd>{vendorPurposeFa[item.key] ?? item.description}</dd>
              </dl>
              <div className="button-row"><Link className="secondary-link" to={`/assets/vendors/${item.key}`}>مشاهده وندور</Link><Link className="primary-link" to={`/assets/vendors/${item.key}/devices/new`}>{vendorOnboardingLabelFa[item.key] ?? "ثبت دستگاه"}</Link></div>
            </section>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <PageHeader
        title="Cisco"
        eyebrow="مدیریت وندور"
        description="پایه فعلی Cisco فقط خواندنی است. تغییرات VLAN و EtherChannel تا زمان آزمایش و rollback واقعی غیرفعال می‌مانند."
        actions={<><Link className="secondary-link" to="/actions">مرکز اقدام</Link><Link className="primary-link" to="/assets/vendors/cisco/devices/new">ثبت دستگاه Cisco</Link></>}
      />
      <div className="summary-grid">
        <article><span>دستگاه ثبت‌شده</span><strong>{ciscoDeviceCount}</strong></article>
        <article><span>خواندن‌های فعال</span><strong>{implementedReads}</strong></article>
        <article><span>تغییرات غیرفعال</span><strong>{mutations.length}</strong></article>
        <article><span>موارد محدود/آینده</span><strong>{planned.length}</strong></article>
      </div>

      {ciscoDeviceCount === 0 ? (
        <section className="state-card">
          <h2>هنوز دستگاه Cisco متصل نیست</h2>
          <p>برای فعال شدن موجودی عملیاتی، یک Device با vendor برابر Cisco، آدرس مدیریتی، پورت SSH و credential امن لازم است. تا قبل از ثبت و refresh، صفحه فقط قابلیت‌های پشتیبانی‌شده را نشان می‌دهد.</p>
          <div className="button-row">
            <Link className="primary-link" to="/assets/vendors/cisco/devices/new">ثبت دستگاه Cisco</Link>
            <Link className="primary-link" to="/assets/vendors/cisco/devices">مشاهده وضعیت دستگاه‌های Cisco</Link>
          </div>
        </section>
      ) : null}

      <section className="panel-section">
        <h2>خانواده‌های پلتفرم</h2>
        <div className="compact-grid">
          {vendor.platforms.map((platform) => (
            <article key={platform.key} className="mini-card">
              <strong>{platform.titleFa || platform.titleEn}</strong>
              <span className="status-badge">{stateFa[platform.implementationState] ?? platform.implementationState}</span>
              <small>{platform.notes[0] ?? "جزئیات بیشتری ثبت نشده است."}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <h2>قابلیت‌ها بر اساس حوزه</h2>
        <div className="content-grid">
          {grouped.map(([domain, items]) => (
            <article key={domain} className="content-panel">
              <h3>{domainFa[domain] ?? domain}</h3>
              <dl className="detail-list">
                <dt>خواندنی فعال</dt><dd>{items.filter((item) => item.mode === "read" && item.implementationState === "implemented").length}</dd>
                <dt>تغییر یا آینده</dt><dd>{items.filter((item) => item.mode === "mutate" || item.implementationState !== "implemented").length}</dd>
              </dl>
              <ul className="plain-list">
                {items.slice(0, 5).map((item) => <li key={item.key}>{item.titleFa || item.titleEn} <span>{stateFa[item.implementationState] ?? item.implementationState}</span></li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <h2>جزئیات فنی</h2>
        <details>
          <summary>نمایش ماتریس قابلیت‌ها</summary>
          <div className="responsive-table">
            <table>
              <thead><tr><th>قابلیت</th><th>حوزه</th><th>نوع</th><th>وضعیت</th><th>Connector</th></tr></thead>
              <tbody>{vendor.capabilities.map((cap) => <tr key={cap.key}><td>{cap.titleFa || cap.titleEn}</td><td>{domainFa[cap.domain] ?? cap.domain}</td><td>{cap.mode === "read" ? "خواندن" : "تغییر"}</td><td>{stateFa[cap.implementationState] ?? cap.implementationState}</td><td>{cap.actionTemplate ? "ثبت‌شده" : "غیرفعال"}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </section>
    </section>
  );
}
