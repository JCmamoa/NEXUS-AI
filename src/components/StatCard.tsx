interface Props {
  label: string;
  value: string;
  hint?: string;
  tone?: "blue" | "cyan" | "green" | "amber" | "violet";
}

export default function StatCard({ label, value, hint, tone = "blue" }: Props) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}
