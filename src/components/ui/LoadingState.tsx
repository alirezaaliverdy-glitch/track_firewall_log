import { RefreshCw } from "lucide-react";

export function LoadingState({ label = "در حال بارگذاری..." }: { label?: string }) {
  return (
    <div className="state-panel" role="status">
      <RefreshCw className="h-5 w-5 animate-spin text-cyan-300" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
