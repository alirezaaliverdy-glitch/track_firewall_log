import { TriangleAlert } from "lucide-react";

export function ErrorState({ title = "داده در دسترس نیست", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <TriangleAlert className="h-5 w-5 text-rose-300" aria-hidden="true" />
      <div>
        <p className="font-semibold text-rose-100">{title}</p>
        {message ? <p className="mt-1 text-xs text-slate-400">{message}</p> : null}
        {onRetry ? <button type="button" onClick={onRetry} className="mt-3 rounded border border-rose-800 px-3 py-1.5 text-xs text-rose-100">تلاش دوباره</button> : null}
      </div>
    </div>
  );
}
