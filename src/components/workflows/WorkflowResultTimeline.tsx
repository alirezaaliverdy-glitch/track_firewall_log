import type { ReactNode } from "react";

export type WorkflowTimelineTone = "neutral" | "success" | "warning" | "danger";

export type WorkflowTimelineItem = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  time?: ReactNode;
  tone?: WorkflowTimelineTone;
};

export function WorkflowResultTimeline({ items, ariaLabel }: { items: WorkflowTimelineItem[]; ariaLabel: string }) {
  return (
    <ol className="workflow-result-timeline" aria-label={ariaLabel}>
      {items.map((item) => (
        <li key={item.id} className={`workflow-result-timeline__item is-${item.tone ?? "neutral"}`}>
          <span className="workflow-result-timeline__marker" aria-hidden="true" />
          <div>
            <strong>{item.title}</strong>
            {item.description ? <p>{item.description}</p> : null}
            {item.time ? <small>{item.time}</small> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
