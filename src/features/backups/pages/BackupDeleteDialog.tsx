import { useEffect, useId, useRef } from "react";
import { Loader2, Trash2 } from "lucide-react";
export default function BackupDeleteDialog({ open, busy, title, description, onCancel, onConfirm }: {
  open: boolean; busy: boolean; title: string; description: string; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(), descriptionId = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return <dialog ref={dialog} className="backup-delete-dialog" dir="rtl" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <div><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p>
      <footer><button autoFocus disabled={busy} onClick={onCancel}>انصراف</button><button className="backup-delete-button" disabled={busy} onClick={onConfirm}>{busy ? <Loader2 size={18} className="backup-spin" /> : <Trash2 size={18} />}{busy ? "در حال حذف…" : "تأیید حذف"}</button></footer>
    </div>
  </dialog>;
}
