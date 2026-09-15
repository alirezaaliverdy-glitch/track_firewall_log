import type { ReactNode } from "react";

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Remove inner padding — useful when children handle their own padding */
  noPadding?: boolean;
}

/**
 * Consistent card wrapper used for every dashboard panel.
 * Keeps borders, backgrounds, and spacing uniform across sections.
 */
export function SectionCard({
  title,
  subtitle,
  headerRight,
  children,
  className = "",
  noPadding = false,
}: SectionCardProps) {
  const hasHeader = title || headerRight;
  return (
    <div
      className={`mb-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70 shadow-[inset_0_1px_0_rgba(59,130,246,0.08)] ${className}`}
    >
      {hasHeader && (
        <div className="flex items-center justify-between border-b border-slate-800/90 bg-slate-950/60 px-5 py-3.5">
          <div>
            {title && (
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-200">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>
            )}
          </div>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      <div className={noPadding ? "" : "p-5"}>{children}</div>
    </div>
  );
}
