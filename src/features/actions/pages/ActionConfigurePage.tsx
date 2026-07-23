import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui/PageHeader";
import { correctActionFields, dryRunAction, getAction, getActionParameterSchema, normalizeObject, type ActionParameterSchema, type ActionPlan } from "@/lib/actions";
import type { RouteComponentProps } from "@/routes/appRoutes";

function valueFor(plan: ActionPlan | null, key: string, fallback: unknown) {
  const current = plan ? normalizeObject(plan.parametersJson)[key] : undefined;
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

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    Promise.all([getAction(actionId), getActionParameterSchema(actionId)])
      .then(([nextPlan, nextSchema]) => {
        if (cancelled) return;
        setPlan(nextPlan);
        setSchema(nextSchema);
        setValues(Object.fromEntries(nextSchema.fields.map((field) => [field.key, valueFor(nextPlan, field.key, field.defaultValue)])));
      })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Action configuration failed."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [actionId]);

  const missing = useMemo(() => (schema?.fields ?? []).filter((field) => field.required && !values[field.key]?.trim()).map((field) => field.key), [schema?.fields, values]);
  const canSave = Boolean(schema && missing.length === 0 && !busy);

  async function saveDraft(preview: boolean) {
    if (!schema) return;
    setBusy(true);
    setMessage("");
    try {
      const fields = Object.fromEntries(schema.fields.map((field) => {
        const value = values[field.key];
        return [field.key, field.type === "number" ? Number(value) : field.type === "boolean" ? value === "true" : value];
      }));
      const updated = await correctActionFields(actionId, fields);
      setPlan(updated);
      if (preview) {
        await dryRunAction(actionId);
        navigate(`/actions/${encodeURIComponent(actionId)}`);
      } else {
        setMessage(isFa ? "Draft saved." : "Draft saved.");
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
        title={isFa ? "Configure ActionPlan" : "Configure ActionPlan"}
        eyebrow="Parameter Workspace"
        description={isFa ? "Backend-owned parameter schema, validation state, preview, verification, and rollback stay tied to this ActionPlan." : "Backend-owned parameter schema, validation state, preview, verification, and rollback stay tied to this ActionPlan."}
        actions={<Link className="secondary-button" to={`/actions/${encodeURIComponent(actionId)}`}>{isFa ? "Back to Action Center" : "Back to Action Center"}</Link>}
      />
      {message && <div className="state-panel" role="status">{message}</div>}
      {busy && !schema ? <div className="state-panel">{isFa ? "Loading..." : "Loading..."}</div> : null}
      {schema && (
        <>
          <section className="content-panel">
            <h2>{plan?.actionType ?? schema.actionType}</h2>
            <dl className="detail-list">
              <dt>Device</dt><dd>{plan?.device?.name ?? plan?.deviceId ?? "-"}</dd>
              <dt>Vendor</dt><dd>{schema.vendor}</dd>
              <dt>Platform</dt><dd>{schema.platform ?? "-"}</dd>
              <dt>Schema</dt><dd>{schema.schemaVersion}</dd>
            </dl>
          </section>
          <section className="content-panel">
            <h2>{isFa ? "Parameters" : "Parameters"}</h2>
            <div className="operator-parameters">
              {schema.fields.map((field) => (
                <label key={field.key}>
                  {field.label}{field.required ? <small>required</small> : null}
                  {field.type === "boolean" ? (
                    <select value={values[field.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}>
                      <option value="">Select</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      type={field.type === "number" ? "number" : field.secure || field.type === "secretRef" ? "password" : "text"}
                      autoComplete={field.secure || field.type === "secretRef" ? "off" : undefined}
                      value={values[field.key] ?? ""}
                      onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
            {missing.length > 0 && <p className="text-sm text-amber-200">Missing: {missing.join(", ")}</p>}
            <div className="button-row">
              <button className="secondary-button" type="button" disabled={!canSave} onClick={() => void saveDraft(false)}>{isFa ? "Save draft" : "Save draft"}</button>
              <button className="primary-button" type="button" disabled={!canSave} onClick={() => void saveDraft(true)}>{isFa ? "Generate preview" : "Generate preview"}</button>
            </div>
          </section>
          <section className="content-panel">
            <h2>{isFa ? "Validation and rollout" : "Validation and rollout"}</h2>
            <dl className="detail-list">
              <dt>Validation rules</dt><dd>{schema.validationRules.map((rule) => rule.message).join(" ") || "-"}</dd>
              <dt>Derived values</dt><dd>{schema.derivedValues.map((rule) => `${rule.field}: ${rule.rule}`).join(" ") || "-"}</dd>
              <dt>Secret fields</dt><dd>{schema.secretFields.join(", ") || "-"}</dd>
              <dt>Rollback</dt><dd>{String(normalizeObject(plan?.rollbackJson).type ?? "review required")}</dd>
            </dl>
          </section>
        </>
      )}
    </section>
  );
}
