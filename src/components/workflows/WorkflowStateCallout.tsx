import type { ReactNode } from "react";

export type WorkflowCalloutTone = "neutral" | "info" | "success" | "warning" | "danger";

export function WorkflowStateCallout({
  title,
  message,
  tone = "neutral",
  meta
}: {
  title: ReactNode;
  message: ReactNode;
  tone?: WorkflowCalloutTone;
  meta?: ReactNode;
}) {
  return (
    <section className={`workflow-callout is-${tone}`}>
      <div>
        <h3>{title}</h3>
        <p>{message}</p>
      </div>
      {meta ? <div className="workflow-callout__meta">{meta}</div> : null}
    </section>
  );
}
