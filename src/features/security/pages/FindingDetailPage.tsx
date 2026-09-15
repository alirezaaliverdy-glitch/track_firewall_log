import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, AlertTriangle, Check, ChevronDown, Clipboard, Clock3, Crosshair, Database, FileCode2, Fingerprint, Network, Server, ShieldCheck, Tags } from "lucide-react";
import type { RouteComponentProps } from "@/routes/appRoutes";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { createFindingActionPlan, getFindingEvidence, updateFindingStatus, type FindingEvidence } from "@/lib/platform";
import { publishActionPlanCreated } from "@/lib/actionPlanHandoff";
import { useFinding } from "../hooks/useFinding";
import { securityDisplayText } from "../securityPresentation";
import { categoryLabel, findingVendor, sourceLabel, vendorLabel } from "../vendorSecurityPresentation";

function evidenceRows(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object") return value == null ? [] : [["value", String(value)]];
  return Object.entries(value as Record<string, unknown>).slice(0, 30).map(([key, item]) => [key, typeof item === "string" ? item : JSON.stringify(item)]);
}

export default function FindingDetailPage({ params }: RouteComponentProps) {
  const { t, i18n } = useTranslation();
  const { finding, loading, error, refresh } = useFinding(params.findingId);
  const [message, setMessage] = useState("");
  const [evidence, setEvidence] = useState<FindingEvidence | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [expandedEvent, setExpandedEvent] = useState("");
  const [copiedEvent, setCopiedEvent] = useState("");
  const language = i18n.resolvedLanguage ?? i18n.language;
  const locale = language.startsWith("fa") ? "fa-IR" : "en-US";

  const loadEvidence = () => {
    if (!finding || evidenceLoading) return;
    setEvidenceLoading(true);
    setEvidenceError("");
    getFindingEvidence(finding.id)
      .then((result) => { setEvidence(result); setExpandedEvent(result.events[0]?.id ?? ""); })
      .catch((reason: unknown) => setEvidenceError(reason instanceof Error ? reason.message : t("security.detail.evidenceError")))
      .finally(() => setEvidenceLoading(false));
  };
  const createPlan = () => {
    if (!finding) return;
    setMessage(t("security.detail.planCreating"));
    createFindingActionPlan(finding.id)
      .then((result) => { publishActionPlanCreated(result.actionPlan.id); setMessage(t("security.detail.planCreated")); })
      .catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : t("security.detail.planError")));
  };
  const setInvestigating = () => {
    if (!finding) return;
    updateFindingStatus(finding.id, "investigating").then(() => { setMessage(t("security.detail.investigatingSet")); refresh(); }).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : t("security.detail.statusError")));
  };
  const technicalContext = useMemo(() => finding ? [
    finding.actor ? [t("security.detail.actor"), finding.actor] : null,
    finding.srcIp ? [t("security.detail.sourceIp"), finding.srcIp] : null,
    finding.dstIp ? [t("security.detail.destinationIp"), `${finding.dstIp}${finding.dstPort ? `:${finding.dstPort}` : ""}`] : null,
    finding.affectedObject ? [t("security.detail.affectedObject"), finding.affectedObject] : null
  ].filter(Boolean) as Array<[string, string]> : [], [finding, t]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (!finding) return <ErrorState title={t("security.detail.notFound")} />;
  const localizedTitle = securityDisplayText(finding.title, language);
  const localizedSummary = securityDisplayText(finding.summary, language);
  const vendor = findingVendor(finding);
  const assetName = finding.asset?.name ?? finding.device?.name ?? t("security.queue.unknownAsset");
  const address = finding.asset?.managementIp ?? finding.device?.host ?? "—";
  const confidence = Math.round((finding.confidence ?? 0) * 100);

  return (
    <section className="page-stack security-finding-detail">
      <PageHeader title={localizedTitle} eyebrow={t("security.detail.eyebrow")} description={localizedSummary} actions={<div className="security-detail-actions"><button type="button" className="secondary-button" onClick={setInvestigating}>{t("security.detail.startInvestigation")}</button><button type="button" onClick={createPlan}>{t("security.detail.createPlan")}</button></div>} />
      <section className={`security-finding-hero security-finding-hero--${finding.severity}`}>
        <div className="security-finding-hero__identity"><span><ShieldCheck size={29} /></span><div><small>{t("security.detail.vendorDetection")}</small><strong>{vendorLabel(vendor)}</strong><p>{categoryLabel(finding.category, language)} · {sourceLabel(finding.source, language)}</p></div></div>
        <dl>
          <div><dt>{t("security.detail.severity")}</dt><dd className={`security-severity security-severity--${finding.severity}`}>{t(`security.severity.${finding.severity}`, { defaultValue: finding.severity })}</dd></div>
          <div><dt>{t("security.detail.status")}</dt><dd>{t(`security.findingStatus.${finding.status}`, { defaultValue: finding.status })}</dd></div>
          <div><dt>{t("security.detail.confidence")}</dt><dd>{confidence.toLocaleString(locale)}٪</dd></div>
          <div><dt>{t("security.detail.matches")}</dt><dd>{finding.count.toLocaleString(locale)}</dd></div>
        </dl>
      </section>

      <div className="security-finding-context-grid">
        <article><span><Server size={19} /></span><div><small>{t("security.detail.asset")}</small><strong>{assetName}</strong><b dir="ltr">{address}</b></div></article>
        <article><span><Clock3 size={19} /></span><div><small>{t("security.detail.firstSeen")}</small><strong>{new Date(finding.firstSeen).toLocaleString(locale)}</strong><b>{t("security.detail.lastSeen")}: {new Date(finding.lastSeen).toLocaleString(locale)}</b></div></article>
        <article><span><Fingerprint size={19} /></span><div><small>{t("security.detail.detectionSource")}</small><strong>{sourceLabel(finding.source, language)}</strong><b>{categoryLabel(finding.category, language)}</b></div></article>
      </div>

      <div className="security-finding-analysis-grid">
        <section className="security-detail-panel"><header><span><AlertTriangle size={19} /></span><div><small>{t("security.detail.analysisEyebrow")}</small><h2>{t("security.detail.whatHappened")}</h2></div></header><p>{localizedSummary}</p><div className="security-detail-facts">{technicalContext.length ? technicalContext.map(([label, value]) => <span key={label}><small>{label}</small><b dir={label.includes("IP") ? "ltr" : undefined}>{value}</b></span>) : <p>{t("security.detail.noTechnicalContext")}</p>}</div></section>
        <section className="security-detail-panel"><header><span><Tags size={19} /></span><div><small>{t("security.detail.classificationEyebrow")}</small><h2>{t("security.detail.classification")}</h2></div></header><div className="security-classification-tags"><span>{vendorLabel(vendor)}</span><span>{categoryLabel(finding.category, language)}</span>{finding.mitreTags?.map((tag) => <span key={tag} dir="ltr">MITRE {tag}</span>)}</div><p>{t("security.detail.classificationHelp")}</p></section>
      </div>

      <section className="security-evidence-workspace">
        <header><div><span>{t("security.detail.evidenceEyebrow")}</span><h2>{t("security.detail.realLogs")}</h2><p>{t("security.detail.realLogsDescription")}</p></div>{!evidence ? <button type="button" onClick={loadEvidence} disabled={evidenceLoading}><Database size={17} />{evidenceLoading ? t("security.detail.loadingLogs") : t("security.detail.showLogs")}</button> : <span className={`security-evidence-availability security-evidence-availability--${evidence.availability}`}><i />{t(`security.detail.availability.${evidence.availability}`)}</span>}</header>
        {evidenceError ? <div className="security-evidence-notice is-error"><AlertTriangle size={18} /><p>{evidenceError}</p><button type="button" onClick={loadEvidence}>{t("security.detail.retry")}</button></div> : null}
        {evidence ? <>
          <div className="security-evidence-provenance"><span><ShieldCheck size={16} />{t("security.detail.redactionNotice")}</span><span><Fingerprint size={16} />{t("security.detail.exactEvidence", { resolved: evidence.integrity.resolvedReferenceCount.toLocaleString(locale), total: evidence.integrity.referenceCount.toLocaleString(locale) })}</span><span><Network size={16} />{evidence.profile ? `${evidence.profile.vendorName}: ${evidence.profile.liveSources.map((source) => sourceLabel(source, language)).join("، ")}` : sourceLabel(evidence.source, language)}</span></div>
          {evidence.integrity.unresolvedReferenceCount > 0 ? <div className="security-evidence-notice"><AlertTriangle size={18} /><p>{t("security.detail.unresolvedEvidence", { count: evidence.integrity.unresolvedReferenceCount.toLocaleString(locale) })}</p></div> : null}
          {evidence.events.length ? <div className="security-raw-event-list">{evidence.events.map((event) => <article key={event.id} className={expandedEvent === event.id ? "is-expanded" : ""}>
            <button type="button" className="security-raw-event-head" onClick={() => setExpandedEvent(expandedEvent === event.id ? "" : event.id)} aria-expanded={expandedEvent === event.id}><span><FileCode2 size={18} /></span><div><strong>{sourceLabel(event.sourceType ?? event.eventType, language)}</strong><small>{new Date(event.timestamp).toLocaleString(locale)} · <b dir="ltr">{event.srcIp ?? event.username ?? event.eventType}</b></small></div><ChevronDown size={17} /></button>
            {expandedEvent === event.id ? <div className="security-raw-event-body"><div className="security-raw-log-toolbar"><span>{t("security.detail.rawVendorLog")}</span><button type="button" onClick={() => navigator.clipboard.writeText(event.rawMessage).then(() => { setCopiedEvent(event.id); setTimeout(() => setCopiedEvent(""), 1500); })}>{copiedEvent === event.id ? <Check size={15} /> : <Clipboard size={15} />}{copiedEvent === event.id ? t("security.detail.copied") : t("security.detail.copy")}</button></div><pre dir="ltr">{event.rawMessage || t("security.detail.emptyRawMessage")}</pre><dl>{event.action ? <div><dt>{t("security.detail.action")}</dt><dd>{event.action}</dd></div> : null}{event.protocol ? <div><dt>{t("security.detail.protocol")}</dt><dd>{event.protocol}</dd></div> : null}{event.dstIp ? <div><dt>{t("security.detail.destination")}</dt><dd dir="ltr">{event.dstIp}{event.dstPort ? `:${event.dstPort}` : ""}</dd></div> : null}{event.ruleName ? <div><dt>{t("security.detail.rule")}</dt><dd>{event.ruleName}</dd></div> : null}</dl></div> : null}
          </article>)}</div> : null}
          {evidence.availability === "stored_evidence" ? <div className="security-stored-evidence"><div className="security-evidence-notice"><Database size={18} /><p>{t("security.detail.storedEvidenceNotice")}</p></div>{evidence.storedEvidence.map((item) => item.message ? <pre key={item.id} dir="ltr">{item.message}</pre> : null)}</div> : null}
          {evidence.availability === "snapshot" ? <div className="security-snapshot-evidence"><div className="security-evidence-notice"><Activity size={18} /><p>{t("security.detail.snapshotNotice")}</p></div><dl>{evidenceRows(evidence.snapshotEvidence).map(([key, value]) => <div key={key}><dt dir="ltr">{key}</dt><dd dir="ltr">{value}</dd></div>)}</dl></div> : null}
          {evidence.availability === "unavailable" ? <div className="security-evidence-notice"><AlertTriangle size={18} /><p>{t("security.detail.unavailableNotice")}</p></div> : null}
        </> : <div className="security-evidence-placeholder"><Database size={32} /><strong>{t("security.detail.evidenceReady")}</strong><p>{t("security.detail.evidenceReadyDescription")}</p></div>}
      </section>

      <section className="security-recommendation-panel"><div><span><Crosshair size={19} /></span><div><small>{t("security.detail.nextStepEyebrow")}</small><h2>{t("security.detail.nextStep")}</h2><p>{t("security.detail.planSafety")}</p></div></div><button type="button" onClick={createPlan}>{t("security.detail.createPlan")}</button></section>
      {message ? <p className="security-detail-message">{message}</p> : null}
    </section>
  );
}
