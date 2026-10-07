import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Power, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useDetectionRules } from "../hooks/useDetectionRules";
import "./DetectionRulesPage.css";

const VENDORS = ["linux", "mikrotik", "fortigate", "cisco", "pfsense", "account", "general"] as const;
const VENDOR_LABELS: Record<string, string> = { linux: "Linux", mikrotik: "MikroTik", fortigate: "FortiGate", cisco: "Cisco", pfsense: "pfSense", account: "Users", general: "General" };
const RULE_FA: Record<string, [string, string]> = {
  "account.risky-privileged-command": ["دستور حساس با دسترسی ویژه", "اجرای دستور دارای توان تغییر دسترسی، سرویس یا فایروال توسط حساب مشخص؛ نیازمند بررسی مجوز و شاهد"],
  "account.identity-change": ["تغییر حساب یا مدیر", "تغییر کاربر یا حساب مدیریتی با عامل قابل‌انتساب؛ نیازمند بررسی تأیید تغییر"],
  "account.configuration-change": ["تغییر پیکربندی توسط حساب", "ثبت تغییر پیکربندی همراه با نام حساب؛ تغییر لزوماً غیرمجاز نیست"],
  "linux.auth-failure-burst": ["تلاش ناموفق ورود در لینوکس", "افزایش ورودهای ناموفق SSH، PAM یا احراز هویت از یک مبدأ"], "linux.root-remote-login": ["ورود راه‌دور با کاربر root", "ورود موفق مستقیم به حساب root از مسیر راه‌دور"], "linux.sudo-failure": ["خطای تکراری sudo", "تلاش‌های ناموفق برای ارتقای سطح دسترسی"], "linux.firewall-disabled": ["غیرفعال‌شدن فایروال میزبان", "توقف یا غیرفعال‌شدن UFW، firewalld، nftables یا iptables"], "linux.audit-tamper": ["دستکاری ردپای ممیزی", "توقف auditd یا پاک‌سازی لاگ‌های امنیتی"],
  "mikrotik.login-failure-burst": ["تلاش ناموفق ورود به MikroTik", "افزایش خطای ورود از مسیر SSH، WinBox، API یا حساب RouterOS"], "mikrotik.admin-change": ["تغییر حساب مدیریتی MikroTik", "ایجاد، حذف یا تغییر سطح دسترسی کاربر RouterOS"], "mikrotik.management-exposure": ["فعال‌شدن سرویس مدیریت ناامن", "فعال‌شدن Telnet، FTP، WebFig HTTP یا API"], "mikrotik.firewall-change": ["تغییر سیاست فایروال MikroTik", "تغییر در Filter، Raw، Mangle یا NAT"], "mikrotik.vpn-failure-burst": ["خطای تکراری VPN در MikroTik", "شکست احراز هویت یا مذاکره IPsec، L2TP، OpenVPN یا WireGuard"],
  "fortigate.admin-login-failure": ["تلاش ناموفق ورود مدیر FortiGate", "افزایش خطای ورود مدیریتی از GUI، SSH یا API"], "fortigate.admin-change": ["تغییر حساب مدیر FortiGate", "ایجاد، حذف یا تغییر پروفایل دسترسی مدیر"], "fortigate.sslvpn-failure": ["خطای تکراری SSL-VPN", "شکست‌های متوالی احراز هویت SSL-VPN یا IPsec"], "fortigate.security-threat": ["تهدید شدید FortiGate", "تهدید بحرانی IPS، ضدبدافزار، Botnet یا UTM"], "fortigate.policy-change": ["تغییر سیاست امنیتی FortiGate", "تغییر Firewall Policy، Local-in، VIP یا NAT"],
  "cisco.login-failure-burst": ["تلاش ناموفق AAA در Cisco", "افزایش خطاهای ورود محلی یا AAA در IOS/IOS-XE"], "cisco.configuration-change": ["تغییر پیکربندی Cisco", "ثبت تغییر یا Commit پیکربندی توسط اپراتور"], "cisco.insecure-management": ["دسترسی مدیریتی ناامن Cisco", "فعال‌شدن Telnet، HTTP یا سرویس مدیریت ناامن"], "cisco.acl-deny-spike": ["افزایش ردشدن ترافیک در ACL", "افزایش ناگهانی بسته‌های ردشده از یک مبدأ"], "cisco.vpn-failure": ["خطای تکراری VPN در Cisco", "شکست مذاکره IKE، IPsec یا AnyConnect"],
  "pfsense.login-failure-burst": ["تلاش ناموفق ورود به pfSense", "افزایش خطای ورود WebGUI، SSH یا احراز هویت محلی"], "pfsense.sshguard-spike": ["افزایش مسدودسازی sshguard", "مسدودسازی تکراری مبدأها پس از سوءاستفاده از ورود"], "pfsense.firewall-block-spike": ["افزایش مسدودسازی فایروال pfSense", "افزایش ناگهانی رخدادهای Block از یک مبدأ"], "pfsense.nat-change": ["تغییر NAT یا Port Forward", "تغییر در NAT، انتقال پورت یا قانون فایروال"], "pfsense.vpn-failure": ["خطای تکراری VPN در pfSense", "شکست احراز هویت یا برقراری OpenVPN و IPsec"]
};
const LEGACY_FA: Record<string, [string, string]> = {
  "Repeated failed logins": ["ورودهای ناموفق تکراری", "تلاش‌های ورود ردشده از یک مبدأ در وندورهای پشتیبانی‌شده"], "Login from new source": ["ورود از مبدأ جدید", "ورود موفق از مبدأیی که قبلاً دیده نشده است"], "Admin account created": ["ایجاد حساب مدیریتی", "ایجاد حسابی با دسترسی مدیریتی"], "Firewall policy change": ["تغییر سیاست فایروال", "تغییر پیکربندی فایروال یا سیاست امنیتی"], "NAT change": ["تغییر NAT", "تغییر پیکربندی NAT"], "Management service enabled": ["فعال‌شدن سرویس مدیریت", "فعال‌شدن یک سرویس مدیریتی"], "Interface unexpectedly down": ["قطع غیرمنتظره رابط", "تغییر وضعیت رابط شبکه به Down"], "VPN authentication failure": ["خطای احراز هویت VPN", "شکست تکراری احراز هویت VPN"], "New listening port": ["پورت شنونده جدید", "شناسایی سرویس شنونده جدید"], "Firewall disabled": ["غیرفعال‌شدن فایروال", "غیرفعال‌شدن فایروال میزبان"], "Critical service stopped": ["توقف سرویس حیاتی", "توقف یا شکست سرویس حیاتی"], "Repeated Daily Check failures": ["شکست تکراری پایش روزانه", "شکست متوالی اجرای Daily Check"]
};

function queryValue(rule: { queryJson?: Record<string, unknown> }, key: string) { return rule.queryJson?.[key]; }
function standards(rule: { queryJson?: Record<string, unknown> }) { const value = queryValue(rule, "standards"); return Array.isArray(value) ? value.map((item) => item && typeof item === "object" ? `${String((item as Record<string, unknown>).framework ?? "")} ${String((item as Record<string, unknown>).control ?? "")}`.trim() : "").filter(Boolean) : []; }
function belongsToTab(rule: { queryJson?: Record<string, unknown> }, tab: (typeof VENDORS)[number]) {
  const scope = queryValue(rule, "scope");
  if (tab === "account") return scope === "account";
  if (tab === "general") return !queryValue(rule, "vendor") && scope !== "account";
  return queryValue(rule, "vendor") === tab;
}

export default function DetectionRulesPage() {
  const { t, i18n } = useTranslation();
  const isFa = (i18n.resolvedLanguage ?? i18n.language).startsWith("fa");
  const { rules, loading, error, actionError, busyId, refresh, updateEnabled } = useDetectionRules();
  const [vendor, setVendor] = useState<(typeof VENDORS)[number]>("linux");
  const vendorRules = useMemo(() => rules.filter((rule) => belongsToTab(rule, vendor)), [rules, vendor]);
  const counts = Object.fromEntries(VENDORS.map((item) => [item, rules.filter((rule) => belongsToTab(rule, item)).length]));

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  return <section className="page-stack security-rules-page">
    <PageHeader title={t("security.rules.title")} eyebrow={t("security.rules.eyebrow")} description={isFa ? "قوانین هر وندور، آستانه‌ها و وضعیت فعال‌بودن آن‌ها را در یک نمای متمرکز مدیریت کنید." : "Manage vendor rules, thresholds, and enabled state in one focused workspace."} />
    <section className="security-rule-library"><header><div><SlidersHorizontal size={20} /><div><h2>{isFa ? "قوانین وندورها و حساب‌ها" : "Vendor & account rules"}</h2><p>{isFa ? "هر قانون به رخداد واقعی، آستانه زمانی و یافتهٔ قابل پیگیری متصل است." : "Each rule is linked to real events, a time window, and a traceable finding."}</p></div></div></header><div className="security-rule-vendors" role="tablist" aria-label={isFa ? "دسته قوانین" : "Rule groups"}>{VENDORS.map((item) => <button key={item} type="button" role="tab" aria-selected={vendor === item} className={vendor === item ? "is-active" : ""} onClick={() => setVendor(item)}><strong>{item === "general" && isFa ? "عمومی" : item === "account" && isFa ? "کاربران" : VENDOR_LABELS[item]}</strong><span>{counts[item] ?? 0} {isFa ? "قانون" : "rules"}</span></button>)}</div>{vendor === "account" ? <p className="security-account-rule-note">{isFa ? "فقط رویدادهای دارای عامل مشخص بررسی می‌شوند. این هشدارها نیازمند بررسی شواهد هستند و سوءاستفاده را اثبات نمی‌کنند. ورودهای متعلق به خود برنامه حذف می‌شوند." : "Only events with an attributable actor are checked. These signals require evidence review and do not prove misuse. App-owned logins are excluded."} <Link to="/security/vendor-users">{isFa ? "مشاهدهٔ کاربران و فعالیت‌ها" : "Open vendor users & activity"}</Link></p> : null}{actionError ? <div role="alert" className="state-card is-error">{actionError}</div> : null}<div className="security-rule-list">{vendorRules.map((rule) => { const key = String(queryValue(rule, "ruleKey") ?? ""); const localized = RULE_FA[key] ?? LEGACY_FA[rule.name]; const threshold = Number(rule.thresholdJson?.count ?? 1); const windowMinutes = Number(rule.thresholdJson?.windowMinutes ?? 15); return <article key={rule.id} className={`security-rule-row security-rule-row--${rule.severity} ${rule.enabled ? "is-enabled" : "is-disabled"}`}><span className="security-rule-row__signal"><i /></span><div className="security-rule-row__content"><div><h3>{isFa && localized ? localized[0] : rule.name}</h3><span className={`security-severity security-severity--${rule.severity}`}>{t(`security.severity.${rule.severity}`, { defaultValue: rule.severity })}</span></div><p>{isFa && localized ? localized[1] : rule.description}</p><div className="security-rule-row__refs">{standards(rule).slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div></div><div className="security-rule-row__threshold"><small>{isFa ? "آستانه" : "Threshold"}</small><strong>{threshold} {isFa ? `رخداد / ${windowMinutes} دقیقه` : `events / ${windowMinutes} min`}</strong></div><button type="button" className={rule.enabled ? "is-on" : ""} disabled={busyId === rule.id} aria-pressed={rule.enabled} onClick={() => void updateEnabled(rule.id, !rule.enabled)}><Power size={16} /><span>{busyId === rule.id ? t("security.rules.saving") : rule.enabled ? t("security.rules.active") : t("security.rules.inactive")}</span></button></article>; })}</div></section>
  </section>;
}
