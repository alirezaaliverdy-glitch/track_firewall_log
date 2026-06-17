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
      className={`rounded-xl border border-zinc-700/60 bg-zinc-900 mb-4 overflow-hidden ${className}`}
    >
      {hasHeader && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-700/60">
          <div>
            {title && (
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-widest">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      <div className={noPadding ? "" : "p-5"}>{children}</div>
    </div>
  );
}
