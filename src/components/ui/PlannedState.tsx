export function PlannedState({ title, description }: { title: string; description?: string }) {
  return (
    <section className="content-panel">
      <span className="status-badge status-badge--warning">planned</span>
      <h2 className="mt-3 text-lg font-semibold text-slate-100">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{description ?? "این مسیر هنوز صفحه عملیاتی متصل به API ندارد."}</p>
    </section>
  );
}
