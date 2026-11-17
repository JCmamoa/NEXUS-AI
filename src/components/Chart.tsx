import type { ChartSeries } from "../types";

const PALETTE = [
  "#4f8cff",
  "#22d3ee",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
];

interface Props {
  labels: string[];
  series: ChartSeries[];
  type?: "bar" | "line";
  unit?: string;
}

const W = 760;
const H = 320;
const PAD = { top: 18, right: 18, bottom: 40, left: 64 };

function formatTick(value: number, unit?: string): string {
  const abs = Math.abs(value);
  let text: string;
  if (abs >= 1_000_000) text = `${(value / 1_000_000).toFixed(1)}M`;
  else if (abs >= 1_000) text = `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  else text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit === "%" ? `${text}%` : unit === "$" ? `$${text}` : text;
}

/** Dependency-free SVG chart (bar or grouped line) used by Module C. */
export default function Chart({ labels, series, type = "bar", unit }: Props) {
  const values = series.flatMap((s) => s.values);
  let max = Math.max(...values, 0);
  let min = Math.min(...values, 0);
  if (max === min) max = min + 1;
  if (type === "line") {
    const span = max - min;
    max += span * 0.1;
    min -= span * 0.1;
  } else if (min > 0) {
    min = 0;
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = labels.length > 0 ? plotW / labels.length : plotW;
  const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH;

  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  const showEvery = labels.length > 9 ? 2 : 1;

  const groupW = band * 0.7;
  const barW = series.length > 0 ? groupW / series.length : groupW;

  return (
    <div className="chart">
      <div className="chart-legend">
        {series.map((s, i) => (
          <span key={s.name} className="legend-item">
            <i style={{ background: PALETTE[i % PALETTE.length] }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart-svg"
        role="img"
        aria-label="chart"
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="grid-line"
            />
            <text x={PAD.left - 8} y={y(t) + 4} className="tick" textAnchor="end">
              {formatTick(t, unit)}
            </text>
          </g>
        ))}

        {labels.map((label, i) => (
          <text
            key={label + i}
            x={PAD.left + band * i + band / 2}
            y={H - 14}
            className="tick"
            textAnchor="middle"
          >
            {i % showEvery === 0 ? label : ""}
          </text>
        ))}

        {type === "bar"
          ? series.map((s, si) =>
              s.values.map((v, i) => (
                <rect
                  key={`${si}-${i}`}
                  x={PAD.left + band * i + (band - groupW) / 2 + barW * si}
                  y={Math.min(y(v), y(0))}
                  width={Math.max(barW - 3, 2)}
                  height={Math.abs(y(0) - y(v))}
                  rx={3}
                  fill={PALETTE[si % PALETTE.length]}
                  opacity={0.9}
                >
                  <title>{`${s.name} · ${labels[i]}: ${formatTick(v, unit)}`}</title>
                </rect>
              )),
            )
          : series.map((s, si) => {
              const pts = s.values
                .map((v, i) => `${PAD.left + band * i + band / 2},${y(v)}`)
                .join(" ");
              return (
                <g key={si}>
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={PALETTE[si % PALETTE.length]}
                    strokeWidth={2.5}
                  />
                  {s.values.map((v, i) => (
                    <circle
                      key={i}
                      cx={PAD.left + band * i + band / 2}
                      cy={y(v)}
                      r={3.5}
                      fill={PALETTE[si % PALETTE.length]}
                    >
                      <title>{`${s.name} · ${labels[i]}: ${formatTick(v, unit)}`}</title>
                    </circle>
                  ))}
                </g>
              );
            })}
      </svg>
    </div>
  );
}
