import { useTranslation } from "react-i18next";
import { AccessLink as Link } from "@/components/auth/AccessLink";
import { ChevronLeft, Clock3, Crosshair, FileSearch2, ShieldAlert } from "lucide-react";
import type { SecurityFinding, VendorFindingProfile } from "@/lib/platform";
import { securityDisplayText } from "../securityPresentation";
import { categoryLabel, findingVendor, sourceLabel, vendorLabel } from "../vendorSecurityPresentation";
import { groupFindings } from "../findingGroups";

function displayClass(value: string, values: string[]) {
  return values.includes(value) ? value : "unknown";
}

export function FindingTable({ findings, profiles = [] }: { findings: SecurityFinding[]; profiles?: VendorFindingProfile[] }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const locale = language.startsWith("fa") ? "fa-IR" : "en-US";
  return (
    <div className="security-findings-list">
      {groupFindings(findings).map(({ finding, members, ips }) => {
        const severity = displayClass(finding.severity, ["critical", "high", "medium", "low"]);
        const status = displayClass(finding.status, ["active", "acknowledged", "investigating", "resolved", "false_positive", "accepted_risk", "suppressed"]);
        return (
          <article key={finding.id} className={`security-finding-card security-finding-card--${severity}`}>
            <span className="security-finding-card__icon"><ShieldAlert size={22} /></span>
            <div className="security-finding-card__body">
              <div className="security-finding-card__title"><Link to={`/security/findings/${finding.id}`}>{securityDisplayText(finding.title, language)}</Link><span className={`security-severity security-severity--${severity}`}>{t(`security.severity.${severity}`, { defaultValue: finding.severity })}</span></div>
              <p>{ips.length ? <bdi>{ips.slice(0, 4).join(" · ")}{ips.length > 4 ? ` +${ips.length - 4}` : ""}</bdi> : securityDisplayText(finding.summary, language)}{members.length > 1 ? <span> · {members.length.toLocaleString(locale)} {language.startsWith("fa") ? "یافته در بازهٔ ۱۵ دقیقه‌ای" : "findings in a 15-minute window"}</span> : null}</p>
              <div className="security-finding-card__taxonomy"><span>{vendorLabel(findingVendor(finding), profiles)}</span><span>{categoryLabel(finding.category, language)}</span><span>{sourceLabel(finding.source, language)}</span></div>
              <div className="security-finding-card__meta"><span><Crosshair size={14} />{finding.asset?.name ?? finding.device?.name ?? t("security.queue.unknownAsset")}</span><span><FileSearch2 size={14} />{finding.count.toLocaleString(locale)} {t("security.findings.matches")}</span><span><Clock3 size={14} />{finding.lastSeen ? new Date(finding.lastSeen).toLocaleString(locale) : "—"}</span></div>
            </div>
            <div className="security-finding-card__action"><span className={`security-finding-status security-finding-status--${status}`}><i />{t(`security.findingStatus.${status}`, { defaultValue: finding.status })}</span><Link to={`/security/findings/${finding.id}`}>{t("security.findings.review")}<ChevronLeft size={16} /></Link></div>
          </article>
        );
      })}
    </div>
  );
}
