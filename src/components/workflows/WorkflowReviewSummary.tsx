import { useId, type ReactNode } from "react";

export type WorkflowReviewItem = {
  id: string;
  label: ReactNode;
  value: ReactNode;
  technical?: boolean;
};

export function WorkflowReviewSummary({ title, items }: { title: ReactNode; items: WorkflowReviewItem[] }) {
  const titleId = useId();
  return (
    <section className="workflow-review-summary" aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      <dl>
        {items.map((item) => (
          <div key={item.id}>
            <dt>{item.label}</dt>
            <dd dir={item.technical ? "ltr" : undefined}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
