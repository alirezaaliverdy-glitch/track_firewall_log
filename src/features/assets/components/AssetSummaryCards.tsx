import { Boxes, CheckCircle2, MapPin, TriangleAlert, WifiOff } from "lucide-react";

export function AssetSummaryCards({ stats }: { stats: { total: number; managed: number; unreachable: number; needsReview: number; withoutSite: number } }) {
  const cards = [
    { label: "کل دارایی ها", value: stats.total, icon: Boxes },
    { label: "مدیریت شده", value: stats.managed, icon: CheckCircle2 },
    { label: "خارج از دسترس", value: stats.unreachable, icon: WifiOff },
    { label: "نیازمند بررسی", value: stats.needsReview, icon: TriangleAlert },
    { label: "بدون سایت", value: stats.withoutSite, icon: MapPin }
  ];
  return (
    <div className="summary-grid">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article key={card.label} className="metric-panel">
            <Icon className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            <span>{card.label}</span>
            <strong>{card.value.toLocaleString()}</strong>
          </article>
        );
      })}
    </div>
  );
}
