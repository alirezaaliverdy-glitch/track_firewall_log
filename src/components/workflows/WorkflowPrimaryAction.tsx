import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function WorkflowPrimaryAction({
  children,
  busyLabel,
  busy = false,
  icon,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  busyLabel?: ReactNode;
  busy?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button {...buttonProps} type={buttonProps.type ?? "button"} className={`workflow-primary-action ${buttonProps.className ?? ""}`.trim()} disabled={buttonProps.disabled || busy}>
      {busy ? <Loader2 className="workflow-primary-action__icon is-spinning" aria-hidden="true" /> : icon ? <span className="workflow-primary-action__icon">{icon}</span> : null}
      <span>{busy && busyLabel ? busyLabel : children}</span>
    </button>
  );
}
