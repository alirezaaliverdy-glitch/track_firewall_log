import { useState } from "react";
import { Building2, Check, Edit3, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { archiveCompany, createCompany, restoreCompany, updateCompany, type Company } from "@/lib/companies";

type Props = {
  companies: Company[];
  archived: Company[];
  selectedId: string;
  onSelect: (id: string) => void;
  onChanged: () => Promise<void> | void;
};

type Draft = { name: string; code: string; description: string };
const emptyDraft: Draft = { name: "", code: "", description: "" };

export function CompanyManager({ companies, archived, selectedId, onSelect, onChanged }: Props) {
  const [editing, setEditing] = useState<Company | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [removing, setRemoving] = useState<Company | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function openEditor(company?: Company) {
    setEditing(company ?? "new");
    setDraft(company ? { name: company.name, code: company.code, description: company.description ?? "" } : emptyDraft);
    setError("");
  }

  async function save() {
    setBusy(true); setError("");
    try {
      if (editing === "new") await createCompany(draft);
      else if (editing) await updateCompany(editing.id, draft);
      setEditing(null);
      await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ذخیره شرکت انجام نشد."); }
    finally { setBusy(false); }
  }

  async function archive() {
    if (!removing || confirmation !== removing.name) return;
    setBusy(true); setError("");
    try {
      await archiveCompany(removing.id, confirmation);
      setRemoving(null); setConfirmation("");
      await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "حذف شرکت انجام نشد."); }
    finally { setBusy(false); }
  }

  async function restore(id: string) {
    setBusy(true); setError("");
    try { await restoreCompany(id); await onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "بازیابی شرکت انجام نشد."); }
    finally { setBusy(false); }
  }

  return (
    <section className="company-manager" aria-labelledby="company-manager-title">
      <header>
        <div><span className="company-manager__icon"><Building2 size={20} /></span><div><h2 id="company-manager-title">شرکت‌ها و دارایی‌ها</h2><p>دارایی‌های هر شرکت کاملاً جدا نمایش داده می‌شوند.</p></div></div>
        <button type="button" className="primary-button" onClick={() => openEditor()}><Plus size={17} />شرکت جدید</button>
      </header>
      <div className="company-switcher" role="tablist" aria-label="انتخاب شرکت">
        {companies.map((company) => (
          <div key={company.id} className={`company-switcher__item${selectedId === company.id ? " is-selected" : ""}`}>
            <button type="button" className="company-switcher__select" role="tab" aria-selected={selectedId === company.id} onClick={() => onSelect(company.id)}>
              <span><strong>{company.name}</strong><small dir="ltr">{company.code}</small></span>
              <b>{company._count.assets} دارایی</b>
            </button>
            <div className="company-switcher__actions">
              <button type="button" onClick={() => openEditor(company)} aria-label={`ویرایش ${company.name}`}><Edit3 size={14} /></button>
              <button type="button" className="is-danger" onClick={() => { setRemoving(company); setConfirmation(""); }} aria-label={`حذف ${company.name}`}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {!companies.length ? <p className="company-manager__empty">برای ثبت دستگاه ابتدا یک شرکت بسازید.</p> : null}
      </div>
      <button type="button" className="company-manager__archive-toggle" onClick={() => setShowArchived((value) => !value)}>{showArchived ? "بستن بایگانی" : `بایگانی شرکت‌ها (${archived.length})`}</button>
      {showArchived ? <div className="company-archive-list">{archived.length ? archived.map((company) => <div key={company.id}><span><strong>{company.name}</strong><small dir="ltr">{company.code}</small></span><button type="button" disabled={busy} onClick={() => void restore(company.id)}><RotateCcw size={15} />بازیابی شرکت و دارایی‌ها</button></div>) : <p>شرکت حذف‌شده‌ای وجود ندارد.</p>}</div> : null}
      {error ? <p className="company-manager__error" role="alert">{error}</p> : null}

      {editing ? <div className="action-review-dialog" role="dialog" aria-modal="true" aria-labelledby="company-editor-title"><section className="action-review-dialog__card company-dialog"><header><div><h2 id="company-editor-title">{editing === "new" ? "تعریف شرکت جدید" : "ویرایش شرکت"}</h2><p>کد شرکت در حساب شما یکتا است.</p></div><button type="button" onClick={() => setEditing(null)} aria-label="بستن"><X /></button></header><div className="company-form"><label><span>نام شرکت</span><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label><span>کد شرکت</span><input dir="ltr" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} placeholder="ACME-01" /></label><label className="is-wide"><span>توضیحات</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></div><footer><button type="button" className="secondary-button" onClick={() => setEditing(null)}>انصراف</button><button type="button" className="primary-button" disabled={busy || draft.name.trim().length < 2 || draft.code.trim().length < 2} onClick={() => void save()}><Check size={17} />{busy ? "در حال ذخیره…" : "ذخیره شرکت"}</button></footer></section></div> : null}

      {removing ? <div className="action-review-dialog" role="dialog" aria-modal="true" aria-labelledby="company-delete-title"><section className="action-review-dialog__card company-dialog company-dialog--danger"><header><div><h2 id="company-delete-title">حذف «{removing.name}»؟</h2><p>شرکت و همه دستگاه‌ها و دارایی‌های آن فوراً از محیط فعال خارج می‌شوند.</p></div><button type="button" onClick={() => setRemoving(null)} aria-label="بستن"><X /></button></header><div className="company-delete-warning"><Trash2 /><div><strong>این عملیات روی تمام دارایی‌های شرکت اثر دارد</strong><p>حذف فعلی نرم است و پشتیبانی امکان بازیابی دارد؛ اما پس از پاک‌سازی دائمی پشتیبانی، بازگشت امکان‌پذیر نیست.</p></div></div><label className="company-confirm"><span>برای تأیید، نام شرکت را دقیق وارد کنید: <b>{removing.name}</b></span><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><footer><button type="button" className="secondary-button" onClick={() => setRemoving(null)}>انصراف</button><button type="button" className="danger-button" disabled={busy || confirmation !== removing.name} onClick={() => void archive()}><Trash2 size={17} />{busy ? "در حال حذف…" : "حذف شرکت و دارایی‌ها"}</button></footer></section></div> : null}
    </section>
  );
}
