import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui/PageHeader";
import { correctActionFields, dryRunAction, getAction, getActionParameterSchema, normalizeObject, type ActionParameterField, type ActionParameterSchema, type ActionPlan } from "@/lib/actions";
import type { RouteComponentProps } from "@/routes/appRoutes";

function valueFor(plan: ActionPlan | null, key: string, fallback: unknown) {
  const parameters = plan ? normalizeObject(plan.parametersJson) : {};
  const customPlan = normalizeObject(parameters.customCommandPlan);
  const typedParameters = normalizeObject(customPlan.typedParameters);
  const current = parameters[key] ?? typedParameters[key];
  if (current !== undefined && current !== null) return String(current);
  if (fallback !== undefined && fallback !== null) return String(fallback);
  return "";
}

export default function ActionConfigurePage({ params }: RouteComponentProps) {
  const actionId = params.actionId ?? "";
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isFa = i18n.language?.startsWith("fa") ?? false;
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [schema, setSchema] = useState<ActionParameterSchema | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [step, setStep] = useState(0);

  function relatedSecretChanged(field: ActionParameterField, nextValues = values) {
    const peer = schema?.fields.find((item) => item.confirmFor === field.key || field.confirmFor === item.key);
    return Boolean(nextValues[field.key]?.trim() || (peer && nextValues[peer.key]?.trim()));
  }

  function fieldComplete(field: ActionParameterField, nextValues = values) {
    if (!field.required) return true;
    if (field.configured && field.secure && !relatedSecretChanged(field, nextValues)) return true;
    return Boolean(nextValues[field.key]?.trim());
  }

  function fieldError(field: ActionParameterField, nextValues = values) {
    const value = nextValues[field.key] ?? "";
    if (!fieldComplete(field, nextValues)) return isFa ? "این مقدار الزامی است." : "This value is required.";
    if (!value && field.configured) return "";
    if (field.key === "username" && !/^[a-z_][a-z0-9_.-]{0,31}$/i.test(value)) return isFa ? "نام کاربری باید با حرف یا زیرخط شروع شود و حداکثر ۳۲ نویسه باشد." : "Username must start with a letter or underscore and be at most 32 characters.";
    if (field.minLength && value.length < field.minLength) return isFa ? `حداقل ${field.minLength.toLocaleString("fa-IR")} نویسه وارد کنید.` : `Enter at least ${field.minLength} characters.`;
    if (field.key === "initialPassword" && value && [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length < 3) return isFa ? "رمز باید دست‌کم سه گروه از حروف کوچک، حروف بزرگ، عدد و نماد را داشته باشد." : "Use at least three of lowercase, uppercase, number, and symbol.";
    if (field.confirmFor && value !== (nextValues[field.confirmFor] ?? "")) return isFa ? "تکرار رمز با رمز اولیه یکسان نیست." : "Password confirmation does not match.";
    return "";
  }

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    Promise.all([getAction(actionId), getActionParameterSchema(actionId)])
      .then(([nextPlan, nextSchema]) => {
        if (cancelled) return;
        setPlan(nextPlan);
        setSchema(nextSchema);
        const nextValues = Object.fromEntries(nextSchema.fields.map((field) => [field.key, field.secure ? "" : valueFor(nextPlan, field.key, field.defaultValue)]));
        setValues(nextValues);
        const firstIncomplete = nextSchema.fields.findIndex((field) => field.required && !field.configured && !nextValues[field.key]?.trim());
        setStep(firstIncomplete >= 0 ? firstIncomplete : 0);
      })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Action configuration failed."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [actionId]);

  const missing = (schema?.fields ?? []).filter((field) => !fieldComplete(field)).map((field) => field.key);
  const validationErrors = (schema?.fields ?? []).map((field) => fieldError(field)).filter(Boolean);
  const canSave = Boolean(schema && missing.length === 0 && validationErrors.length === 0 && !busy);
  const activeField = schema?.fields[step] ?? null;
  const activeError = activeField ? fieldError(activeField) : "";
  const activeComplete = Boolean(activeField && fieldComplete(activeField) && !activeError);

  const fieldLabel = (key: string, fallback: string) => {
    if (!isFa) return fallback;
    return ({ username: "نام کاربری", initialPassword: "رمز اولیه", confirmPassword: "تکرار رمز اولیه", serviceName: "نام سرویس", operation: "نوع عملیات", identity: "نام جدید دستگاه", vlanId: "شناسه VLAN", name: "نام", interfaceName: "نام اینترفیس", description: "توضیحات", adminTimeout: "زمان خروج خودکار (دقیقه)", port: "پورت", newPort: "پورت جدید", sourceCidr: "شبکه مبدأ", destinationCidr: "شبکه مقصد", gateway: "دروازه", nextHop: "گام بعدی" } as Record<string, string>)[key] ?? fallback;
  };

  async function saveDraft(preview: boolean) {
    if (!schema) return;
    setBusy(true);
    setMessage("");
    try {
      const fields = Object.fromEntries(schema.fields.filter((field) => !(field.secure && field.configured && !values[field.key])).map((field) => {
        const value = values[field.key];
        return [field.key, field.type === "number" ? Number(value) : field.type === "boolean" ? value === "true" : value];
      }));
      const updated = await correctActionFields(actionId, fields);
      setPlan(updated);
      if (preview) {
        if (updated.status !== "dry_run_ready") await dryRunAction(actionId);
        navigate(`/actions/${encodeURIComponent(actionId)}`);
      } else {
        setMessage(isFa ? "پارامترها ذخیره و اعتبارسنجی شدند." : "Parameters were saved and validated.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action configuration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-stack action-configure-page">
      <PageHeader
        title={isFa ? "تکمیل برنامه عملیات" : "Complete ActionPlan"}
        eyebrow={isFa ? "مرکز عملیات" : "Action Center"}
        description={isFa ? "مقادیر لازم را مرحله‌به‌مرحله وارد کنید؛ سپس پیش‌نمایش امن ساخته می‌شود و هیچ تغییری بدون تأیید شما اجرا نخواهد شد." : "Provide required values one step at a time. A safe preview is generated before explicit confirmation."}
        actions={<Link className="secondary-button" to={`/actions/${encodeURIComponent(actionId)}`}>{isFa ? "بازگشت به مرکز عملیات" : "Back to Action Center"}</Link>}
      />
      {message && <div className="state-panel" role="status">{message}</div>}
      {busy && !schema ? <div className="state-panel">{isFa ? "Loading..." : "Loading..."}</div> : null}
      {schema && (
        <>
          <section className="action-configure-summary" aria-label={isFa ? "خلاصه عملیات" : "Operation summary"}>
            <span><small>{isFa ? "عملیات" : "Operation"}</small><strong>{plan?.actionType ?? schema.actionType}</strong></span>
            <span><small>{isFa ? "دستگاه" : "Device"}</small><strong>{plan?.device?.name ?? plan?.deviceId ?? "-"}</strong></span>
            <span><small>{isFa ? "وندور" : "Vendor"}</small><strong>{schema.vendor}</strong></span>
          </section>
          <section className="content-panel action-configure-card">
            <div className="flex items-center justify-between gap-3">
              <h2>{isFa ? "پارامترهای عملیات" : "Operation parameters"}</h2>
              {schema.fields.length > 0 && <span className="status-chip status-chip--pending">{isFa ? `مرحله ${step + 1} از ${schema.fields.length}` : `Step ${step + 1} of ${schema.fields.length}`}</span>}
            </div>
            {schema.fields.length > 0 && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${((step + 1) / schema.fields.length) * 100}%` }} /></div>}
            {activeField ? <div className="operator-parameters mt-5">
                <label key={activeField.key}>
                  {fieldLabel(activeField.key, activeField.label)}{activeField.required ? <small>{isFa ? "الزامی" : "required"}</small> : <small>{isFa ? "اختیاری" : "optional"}</small>}
                  {(isFa ? activeField.descriptionFa : activeField.descriptionEn) && <span className="action-field-help">{isFa ? activeField.descriptionFa : activeField.descriptionEn}</span>}
                  {activeField.type === "boolean" ? (
                    <select autoFocus value={values[activeField.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [activeField.key]: event.target.value }))}>
                      <option value="">Select</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      autoFocus
                      type={activeField.type === "number" ? "number" : activeField.secure || activeField.type === "secretRef" ? "password" : "text"}
                      autoComplete={activeField.secure || activeField.type === "secretRef" ? "new-password" : undefined}
                      placeholder={isFa ? activeField.placeholderFa : activeField.placeholderEn}
                      value={values[activeField.key] ?? ""}
                      onChange={(event) => setValues((current) => ({ ...current, [activeField.key]: event.target.value }))}
                    />
                  )}
                </label>
            </div> : <p className="mt-4 text-sm text-emerald-200">{isFa ? "این عملیات پارامتر دیگری لازم ندارد و آماده ساخت پیش‌نمایش است." : "This operation needs no additional parameters and is ready for preview."}</p>}
            {activeField?.configured && activeField.secure && !relatedSecretChanged(activeField) && <p className="action-field-configured">{isFa ? "این مقدار قبلاً به‌صورت امن ثبت شده است؛ فقط برای تغییر دوباره واردش کنید." : "This value is already stored securely; enter it only to replace it."}</p>}
            {activeError && <p className="mt-3 text-sm text-amber-200">{activeError}</p>}
            <div className="button-row">
              {step > 0 && <button className="secondary-button" type="button" disabled={busy} onClick={() => setStep((current) => Math.max(0, current - 1))}>{isFa ? "مرحله قبل" : "Previous"}</button>}
              {activeField && step < schema.fields.length - 1
                ? <button className="primary-button" type="button" disabled={!activeComplete || busy} onClick={() => setStep((current) => current + 1)}>{isFa ? "ادامه" : "Continue"}</button>
                : <button className="primary-button" type="button" disabled={!canSave} onClick={() => void saveDraft(true)}>{busy ? (isFa ? "در حال اعتبارسنجی..." : "Validating...") : (isFa ? "ساخت پیش‌نمایش امن" : "Generate safe preview")}</button>}
            </div>
          </section>
          <p className="action-configure-security-note">{isFa ? "مقادیر محرمانه در متن فرمان و گزارش‌ها نمایش داده نمی‌شوند و اجرا فقط پس از پیش‌نمایش و تأیید صریح شما انجام می‌شود." : "Secret values never appear in commands or audit output, and execution still requires preview plus explicit confirmation."}</p>
        </>
      )}
    </section>
  );
}
