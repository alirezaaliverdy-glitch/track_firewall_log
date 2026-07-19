import { PageHeader } from "@/components/ui/PageHeader";
import {
  WorkflowPrimaryAction,
  WorkflowResultTimeline,
  WorkflowReviewSummary,
  WorkflowStateCallout,
  WorkflowStepper,
  type WorkflowCalloutTone,
  type WorkflowStepStatus,
  type WorkflowTimelineTone
} from "@/components/workflows";
import { CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

type LabLanguage = "fa" | "en";

type LabExample = {
  id: string;
  group: "device" | "action";
  titleKey: string;
  descriptionKey: string;
  calloutTitleKey: string;
  calloutMessageKey: string;
  calloutTone: WorkflowCalloutTone;
  actionKey: string;
  actionDisabled?: boolean;
  actionBusy?: boolean;
  stepStatuses: WorkflowStepStatus[];
  timelineTone: WorkflowTimelineTone;
  technical?: boolean;
};

const onboardingSteps = ["workflowLab.steps.identity", "workflowLab.steps.credential", "workflowLab.steps.review", "workflowLab.steps.register"];
const actionSteps = ["workflowLab.steps.draft", "workflowLab.steps.review", "workflowLab.steps.confirm", "workflowLab.steps.result"];

const examples: LabExample[] = [
  {
    id: "device-onboarding-success",
    group: "device",
    titleKey: "workflowLab.examples.onboardingSuccess.title",
    descriptionKey: "workflowLab.examples.onboardingSuccess.description",
    calloutTitleKey: "workflowLab.examples.onboardingSuccess.calloutTitle",
    calloutMessageKey: "workflowLab.examples.onboardingSuccess.calloutMessage",
    calloutTone: "success",
    actionKey: "workflowLab.actions.openOverview",
    stepStatuses: ["complete", "complete", "complete", "complete"],
    timelineTone: "success"
  },
  {
    id: "device-onboarding-failure",
    group: "device",
    titleKey: "workflowLab.examples.onboardingFailure.title",
    descriptionKey: "workflowLab.examples.onboardingFailure.description",
    calloutTitleKey: "workflowLab.examples.onboardingFailure.calloutTitle",
    calloutMessageKey: "workflowLab.examples.onboardingFailure.calloutMessage",
    calloutTone: "danger",
    actionKey: "workflowLab.actions.retryTest",
    stepStatuses: ["complete", "failed", "pending", "pending"],
    timelineTone: "danger"
  },
  {
    id: "device-unverified-registration",
    group: "device",
    titleKey: "workflowLab.examples.unverified.title",
    descriptionKey: "workflowLab.examples.unverified.description",
    calloutTitleKey: "workflowLab.examples.unverified.calloutTitle",
    calloutMessageKey: "workflowLab.examples.unverified.calloutMessage",
    calloutTone: "warning",
    actionKey: "workflowLab.actions.registerUnverified",
    stepStatuses: ["complete", "blocked", "current", "pending"],
    timelineTone: "warning"
  },
  {
    id: "action-review",
    group: "action",
    titleKey: "workflowLab.examples.actionReview.title",
    descriptionKey: "workflowLab.examples.actionReview.description",
    calloutTitleKey: "workflowLab.examples.actionReview.calloutTitle",
    calloutMessageKey: "workflowLab.examples.actionReview.calloutMessage",
    calloutTone: "info",
    actionKey: "workflowLab.actions.confirmExecution",
    stepStatuses: ["complete", "current", "pending", "pending"],
    timelineTone: "neutral"
  },
  {
    id: "action-executing",
    group: "action",
    titleKey: "workflowLab.examples.actionExecuting.title",
    descriptionKey: "workflowLab.examples.actionExecuting.description",
    calloutTitleKey: "workflowLab.examples.actionExecuting.calloutTitle",
    calloutMessageKey: "workflowLab.examples.actionExecuting.calloutMessage",
    calloutTone: "info",
    actionKey: "workflowLab.actions.executing",
    actionBusy: true,
    stepStatuses: ["complete", "complete", "current", "pending"],
    timelineTone: "neutral"
  },
  {
    id: "action-success",
    group: "action",
    titleKey: "workflowLab.examples.actionSuccess.title",
    descriptionKey: "workflowLab.examples.actionSuccess.description",
    calloutTitleKey: "workflowLab.examples.actionSuccess.calloutTitle",
    calloutMessageKey: "workflowLab.examples.actionSuccess.calloutMessage",
    calloutTone: "success",
    actionKey: "workflowLab.actions.viewResult",
    stepStatuses: ["complete", "complete", "complete", "complete"],
    timelineTone: "success"
  },
  {
    id: "action-failure",
    group: "action",
    titleKey: "workflowLab.examples.actionFailure.title",
    descriptionKey: "workflowLab.examples.actionFailure.description",
    calloutTitleKey: "workflowLab.examples.actionFailure.calloutTitle",
    calloutMessageKey: "workflowLab.examples.actionFailure.calloutMessage",
    calloutTone: "danger",
    actionKey: "workflowLab.actions.createRetry",
    stepStatuses: ["complete", "complete", "failed", "pending"],
    timelineTone: "danger"
  },
  {
    id: "planned-cisco-operation",
    group: "action",
    titleKey: "workflowLab.examples.plannedCisco.title",
    descriptionKey: "workflowLab.examples.plannedCisco.description",
    calloutTitleKey: "workflowLab.examples.plannedCisco.calloutTitle",
    calloutMessageKey: "workflowLab.examples.plannedCisco.calloutMessage",
    calloutTone: "warning",
    actionKey: "workflowLab.actions.reviewOnly",
    actionDisabled: true,
    stepStatuses: ["complete", "current", "blocked", "pending"],
    timelineTone: "warning",
    technical: true
  },
  {
    id: "unsupported-operation",
    group: "action",
    titleKey: "workflowLab.examples.unsupported.title",
    descriptionKey: "workflowLab.examples.unsupported.description",
    calloutTitleKey: "workflowLab.examples.unsupported.calloutTitle",
    calloutMessageKey: "workflowLab.examples.unsupported.calloutMessage",
    calloutTone: "danger",
    actionKey: "workflowLab.actions.unavailable",
    actionDisabled: true,
    stepStatuses: ["blocked", "pending", "pending", "pending"],
    timelineTone: "danger",
    technical: true
  }
];

function ExampleCard({ example, lng }: { example: LabExample; lng: LabLanguage }) {
  const { t } = useTranslation();
  const translate = (key: string) => t(key, { lng });
  const isDevice = example.group === "device";
  const stepKeys = isDevice ? onboardingSteps : actionSteps;
  const deviceValue = isDevice ? "edge-lab-01" : "linux-edge-01";
  const operationValue = isDevice ? translate("workflowLab.review.deviceRegistration") : translate("workflowLab.review.actionPlan");

  return (
    <article className="workflow-lab-card">
      <header>
        <div>
          <p className="operator-eyebrow">{translate(isDevice ? "workflowLab.section.device" : "workflowLab.section.actions")}</p>
          <h2>{translate(example.titleKey)}</h2>
          <p>{translate(example.descriptionKey)}</p>
        </div>
        <span className="status-pill">{translate(example.calloutTitleKey)}</span>
      </header>

      <WorkflowStepper
        ariaLabel={translate("workflowLab.stepperLabel")}
        steps={stepKeys.map((key, index) => ({
          id: key,
          label: translate(key),
          status: example.stepStatuses[index] ?? "pending"
        }))}
      />

      <WorkflowStateCallout
        tone={example.calloutTone}
        title={translate(example.calloutTitleKey)}
        message={translate(example.calloutMessageKey)}
        meta={<span>{translate("workflowLab.noExecution")}</span>}
      />

      <WorkflowReviewSummary
        title={translate("workflowLab.reviewTitle")}
        items={[
          { id: "device", label: translate("workflowLab.review.device"), value: deviceValue, technical: true },
          { id: "operation", label: translate("workflowLab.review.operation"), value: operationValue },
          { id: "state", label: translate("workflowLab.review.state"), value: translate(example.calloutTitleKey) },
          { id: "evidence", label: translate("workflowLab.review.evidence"), value: example.technical ? "connectorInvoked=false" : translate("workflowLab.review.fixtureOnly"), technical: example.technical }
        ]}
      />

      <WorkflowResultTimeline
        ariaLabel={translate("workflowLab.timelineLabel")}
        items={[
          { id: "created", title: translate("workflowLab.timeline.created"), description: translate("workflowLab.timeline.createdDescription"), time: "09:12", tone: "success" },
          { id: "current", title: translate(example.calloutTitleKey), description: translate(example.calloutMessageKey), time: "09:14", tone: example.timelineTone }
        ]}
      />

      <footer>
        <WorkflowPrimaryAction busy={example.actionBusy} busyLabel={translate("workflowLab.actions.executing")} disabled={example.actionDisabled} icon={example.calloutTone === "success" ? <CheckCircle2 aria-hidden="true" /> : example.calloutTone === "danger" ? <ShieldAlert aria-hidden="true" /> : <Clock3 aria-hidden="true" />}>
          {translate(example.actionKey)}
        </WorkflowPrimaryAction>
      </footer>
    </article>
  );
}

function LanguagePanel({ lng, dir }: { lng: LabLanguage; dir: "rtl" | "ltr" }) {
  const { t } = useTranslation();
  return (
    <section className="workflow-lab-language" dir={dir} lang={lng}>
      <header>
        <h2>{t(lng === "fa" ? "workflowLab.language.fa" : "workflowLab.language.en", { lng })}</h2>
        <p>{t("workflowLab.languageDescription", { lng })}</p>
      </header>
      <div className="workflow-lab-grid">
        {examples.map((example) => <ExampleCard key={`${lng}-${example.id}`} example={example} lng={lng} />)}
      </div>
    </section>
  );
}

export default function WorkflowLabPage() {
  const { t } = useTranslation();
  return (
    <section className="page-stack workflow-lab-page">
      <PageHeader
        title={t("workflowLab.title")}
        eyebrow={t("workflowLab.eyebrow")}
        description={t("workflowLab.description")}
        actions={<span className="status-pill">{t("workflowLab.devOnly")}</span>}
      />
      <section className="content-panel workflow-lab-boundary">
        <h2>{t("workflowLab.boundaryTitle")}</h2>
        <p>{t("workflowLab.boundaryDescription")}</p>
      </section>
      <LanguagePanel lng="fa" dir="rtl" />
      <LanguagePanel lng="en" dir="ltr" />
    </section>
  );
}
