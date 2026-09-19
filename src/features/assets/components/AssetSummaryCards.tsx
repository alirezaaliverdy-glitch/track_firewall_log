import { Boxes, CircleCheck, CircleDotDashed, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AssetSummaryCards({ stats }: { stats: { total: number; online: number; needsReview: number; unmanaged: number } }) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("fa") ? "fa-IR" : "en-US";
  const cards = [
    { key: "total", label: t("assets.summary.total"), value: stats.total, icon: Boxes },
    { key: "online", label: t("assets.summary.online"), value: stats.online, icon: CircleCheck },
    { key: "attention", label: t("assets.summary.attention"), value: stats.needsReview, icon: TriangleAlert },
    { key: "unmanaged", label: t("assets.summary.unmanaged"), value: stats.unmanaged, icon: CircleDotDashed }
  ];
  return (
    <div className="asset-summary-grid" aria-label={t("assets.summary.label")}>
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article key={card.key} className={`asset-summary-card asset-summary-card--${card.key}`}>
            <span className="asset-summary-card__icon"><Icon size={21} aria-hidden="true" /></span>
            <div><span>{card.label}</span><strong>{card.value.toLocaleString(locale)}</strong></div>
          </article>
        );
      })}
    </div>
  );
}
