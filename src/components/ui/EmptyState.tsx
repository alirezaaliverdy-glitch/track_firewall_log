import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Optional call-to-action slot */
  action?: ReactNode;
  /** Make compact — no min-height */
  compact?: boolean;
}

/**
 * Generic empty state used in panels, charts, and the table
 * when there is nothing to display yet.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center ${
        compact ? "py-6" : "py-12"
      }`}
    >
      {icon && (
        <span className="text-zinc-600 mb-1" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="text-sm font-medium text-zinc-400">{title}</p>
      {description && (
        <p className="text-xs text-zinc-600 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
