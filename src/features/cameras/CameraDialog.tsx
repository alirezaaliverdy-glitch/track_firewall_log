import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function CameraDialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const dialog = ref.current; dialog?.showModal();
    const cancel = (event: Event) => { event.preventDefault(); close.current(); };
    dialog?.addEventListener("cancel", cancel);
    return () => { dialog?.removeEventListener("cancel", cancel); dialog?.close(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className={`camera-dialog ${wide ? "camera-dialog--wide" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="camera-dialog__surface"><header><h2 id={titleId}>{title}</h2><button type="button" className="camera-icon-button" onClick={onClose} aria-label="Close / بستن"><X size={20} /></button></header>{children}</div>
  </dialog>;
}
