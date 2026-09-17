export function StatusBadge({ value, tone = "neutral" }: { value: string; tone?: "good" | "warning" | "danger" | "info" | "neutral" }) {
  return <span className={`status-badge status-badge--${tone}`}>{value}</span>;
}
