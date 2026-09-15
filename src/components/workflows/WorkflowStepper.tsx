import type { ReactNode } from "react";

export type WorkflowStepStatus = "complete" | "current" | "pending" | "failed" | "blocked";

export type WorkflowStep = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  status: WorkflowStepStatus;
};

export function WorkflowStepper({ steps, ariaLabel }: { steps: WorkflowStep[]; ariaLabel: string }) {
  return (
    <ol className="workflow-stepper" aria-label={ariaLabel}>
      {steps.map((step, index) => (
        <li key={step.id} className={`workflow-stepper__item is-${step.status}`} aria-current={step.status === "current" ? "step" : undefined}>
          <span className="workflow-stepper__index">{index + 1}</span>
          <span className="workflow-stepper__body">
            <strong>{step.label}</strong>
            {step.description ? <small>{step.description}</small> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
