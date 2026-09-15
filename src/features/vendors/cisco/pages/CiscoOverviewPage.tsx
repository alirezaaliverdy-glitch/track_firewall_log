import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCiscoDevices, getVendorDetail, listVendors, type VendorDetail, type VendorSummary } from "@/lib/vendors";
import { Link, useLocation } from "react-router-dom";
import { Boxes, CheckCircle2, ChevronLeft, CircleDashed, Network, Radio, Router, Server, Shield, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

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

const supportedOnboarding = new Set(["linux", "cisco", "fortigate", "mikrotik"]);
const vendorVisuals = {
  linux: { icon: Server, tone: "cyan" },
  cisco: { icon: Router, tone: "violet" },
  fortigate: { icon: Shield, tone: "rose" },
  mikrotik: { icon: Radio, tone: "amber" },
  pfsense: { icon: Network, tone: "emerald" },
} as const;

function readinessPercent(state: string) {
  if (state === "implemented") return 100;
  if (state === "partial") return 64;
  if (state === "planned") return 28;
  return 8;
}

export default function CiscoOverviewPage() {
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("fa") ? "fa-IR" : "en-US";
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
    const readyCount = vendors.filter((item) => item.implementationState === "implemented").length;
    const partialCount = vendors.filter((item) => item.implementationState === "partial").length;
    const plannedCount = vendors.length - readyCount - partialCount;
    return (
      <section className="page-stack vendor-catalog-page">
        <PageHeader title={t("vendors.title")} eyebrow={t("vendors.eyebrow")} description={t("vendors.description")} actions={<Link className="primary-link" to="/assets/devices/new"><Sparkles size={16} />{t("vendors.actions.guidedRegister")}</Link>} />

        <section className="vendor-readiness-overview">
          <div className="vendor-readiness-overview__copy"><span>{t("vendors.overview.eyebrow")}</span><h2>{t("vendors.overview.title")}</h2><p>{t("vendors.overview.description")}</p></div>
          <div className="vendor-readiness-stats" aria-label={t("vendors.overview.statsLabel")}>
            <article><span className="is-ready"><CheckCircle2 size={18} /></span><div><strong>{readyCount.toLocaleString(locale)}</strong><small>{t("vendors.states.implemented")}</small></div></article>
            <article><span className="is-partial"><CircleDashed size={18} /></span><div><strong>{partialCount.toLocaleString(locale)}</strong><small>{t("vendors.states.partial")}</small></div></article>
            <article><span className="is-planned"><Boxes size={18} /></span><div><strong>{plannedCount.toLocaleString(locale)}</strong><small>{t("vendors.states.planned")}</small></div></article>
          </div>
        </section>

        <div className="vendor-catalog-grid">
          {vendors.map((item, index) => {
            const visual = vendorVisuals[item.key as keyof typeof vendorVisuals] ?? { icon: Boxes, tone: "slate" };
            const Icon = visual.icon;
            const canRegister = supportedOnboarding.has(item.key);
            const readiness = readinessPercent(item.implementationState);
            return (
              <article key={item.key} className={`vendor-catalog-card vendor-catalog-card--${visual.tone}`} style={{ "--vendor-delay": `${index * 70}ms` } as CSSProperties} data-testid="vendor-catalog-card">
                <header><span className="vendor-catalog-card__icon"><Icon size={25} /></span><span className={`vendor-state vendor-state--${item.implementationState}`}><i />{t(`vendors.states.${item.implementationState}`, { defaultValue: item.implementationState })}</span></header>
                <div className="vendor-catalog-card__title"><h2>{item.titleFa || item.titleEn}</h2><span>{item.key}</span></div>
                <p>{t(`vendors.purpose.${item.key}`, { defaultValue: vendorPurposeFa[item.key] ?? item.description })}</p>
                <div className="vendor-readiness-meter"><span><b>{t("vendors.card.readiness")}</b><strong>{readiness.toLocaleString(locale)}٪</strong></span><div><i style={{ width: `${readiness}%` }} /></div></div>
                <div className="vendor-connector-row"><span>{t("vendors.card.connectors")}</span><div>{item.connectorTypes.length ? item.connectorTypes.map((connector) => <b key={connector} dir="ltr">{connector}</b>) : <b>{t("vendors.card.noConnector")}</b>}</div></div>
                <ul className="vendor-card-facts">
                  <li><CheckCircle2 size={15} />{canRegister ? t("vendors.card.guidedAvailable") : t("vendors.card.guidedPlanned")}</li>
                  <li><Network size={15} />{t(`vendors.card.execution.${item.implementationState}`, { defaultValue: t("vendors.card.execution.planned") })}</li>
                </ul>
                <footer><Link className="vendor-details-link" to={`/assets/vendors/${item.key}`}>{t("vendors.actions.details")}<ChevronLeft size={16} /></Link>{canRegister ? <Link className="vendor-register-link" to={`/assets/vendors/${item.key}/devices/new`}>{t("vendors.actions.register", { vendor: item.titleFa || item.titleEn })}</Link> : <span className="vendor-planned-label">{t("vendors.actions.registrationPlanned")}</span>}</footer>
              </article>
            );
          })}
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
