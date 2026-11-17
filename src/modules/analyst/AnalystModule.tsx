import { useEffect, useState } from "react";
import Chart from "../../components/Chart";
import { api } from "../../lib/ipc";
import { DEFAULT_INPUTS, projectWhatIf } from "../../lib/whatif";
import type { AnalysisResult, WhatIfInputs } from "../../types";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const SLIDERS: {
  key: keyof WhatIfInputs;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}[] = [
  { key: "avgPrice", label: "Average price", min: 10, max: 300, step: 1, unit: "$" },
  { key: "conversionRate", label: "Conversion rate", min: 0.5, max: 8, step: 0.1, unit: "%" },
  { key: "traffic", label: "Monthly visitors", min: 1000, max: 60000, step: 500, unit: "" },
  { key: "shippingCost", label: "Shipping cost / order", min: 0, max: 25, step: 0.5, unit: "$" },
  { key: "adSpend", label: "Ad spend / month", min: 0, max: 15000, step: 100, unit: "$" },
];

export default function AnalystModule() {
  const [question, setQuestion] = useState(
    "Compare net margin by category over the last 6 months",
  );
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [samples, setSamples] = useState<string[]>([]);
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [inputs, setInputs] = useState<WhatIfInputs>(DEFAULT_INPUTS);

  useEffect(() => {
    void api<string[]>("analyst_sample_questions").then(setSamples).catch(() => {});
  }, []);

  const run = async (q: string) => {
    if (!q.trim()) return;
    setBusy(true);
    setError("");
    try {
      setResult(await api<AnalysisResult>("analyst_query", { question: q.trim() }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void run(question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projection = projectWhatIf(inputs);
  const last = projection[projection.length - 1];

  const set = (key: keyof WhatIfInputs, value: number) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <h2>Conversational analyst</h2>
          <span className="badge badge-muted">read-only SQL · no writes</span>
        </div>
        <div className="row">
          <input
            className="input input-grow"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void run(question)}
            placeholder="Ask anything about your data…"
            aria-label="Question"
          />
          <button className="btn" disabled={busy} onClick={() => void run(question)}>
            {busy ? "Querying…" : "Ask"}
          </button>
        </div>
        <div className="chips chips-wrap">
          {samples.map((s) => (
            <button
              key={s}
              className="chip chip-toggle on"
              onClick={() => {
                setQuestion(s);
                void run(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {error && <p className="error-text">{error}</p>}

        {result && (
          <>
            <div className="result-head">
              <span className="badge badge-ok">{result.intent}</span>
              <div className="segmented">
                <button
                  className={chartType === "bar" ? "on" : ""}
                  onClick={() => setChartType("bar")}
                >
                  Bar
                </button>
                <button
                  className={chartType === "line" ? "on" : ""}
                  onClick={() => setChartType("line")}
                >
                  Line
                </button>
              </div>
            </div>

            <Chart
              labels={result.labels}
              series={result.series}
              type={chartType}
              unit={result.intent.startsWith("Net margin") ? "%" : "$"}
            />

            <div className="two-col">
              <div>
                <h3 className="subhead">Result table</h3>
                <table className="table table-compact">
                  <thead>
                    <tr>
                      {result.table.headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.table.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className={j > 0 ? "num" : ""}>
                            {typeof cell === "number"
                              ? cell.toLocaleString("en-US", {
                                  maximumFractionDigits: 2,
                                })
                              : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="subhead">Generated safe query</h3>
                <pre className="sql">{result.sql}</pre>
                <p className="hint">
                  The question is translated into a parameterized, read-only
                  query against the connected database. Aggregations run in the
                  database; raw credentials never leave this machine.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>What-if simulator</h2>
          <span className="badge badge-muted">6-month projection · live</span>
        </div>

        <div className="two-col">
          <div className="sliders">
            {SLIDERS.map((s) => (
              <label key={s.key} className="slider-row">
                <span>
                  {s.label}
                  <strong>
                    {s.unit === "$" && s.key !== "traffic" && s.key !== "adSpend"
                      ? "$"
                      : ""}
                    {inputs[s.key].toLocaleString("en-US")}
                    {s.unit === "%" ? "%" : ""}
                    {s.key === "traffic" ? " visitors" : ""}
                    {s.key === "adSpend" ? "/mo" : ""}
                    {s.key === "shippingCost" ? "/order" : ""}
                    {s.key === "avgPrice" ? " avg" : ""}
                  </strong>
                </span>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={inputs[s.key]}
                  onChange={(e) => set(s.key, Number(e.target.value))}
                />
              </label>
            ))}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setInputs(DEFAULT_INPUTS)}
            >
              Reset to defaults
            </button>
          </div>

          <div>
            <div className="stat-grid stat-grid-3">
              <div className="stat-card tone-cyan">
                <span className="stat-label">M6 revenue</span>
                <span className="stat-value">{money(last.revenue)}</span>
              </div>
              <div className="stat-card tone-green">
                <span className="stat-label">M6 net profit</span>
                <span className="stat-value">{money(last.netProfit)}</span>
              </div>
              <div className="stat-card tone-violet">
                <span className="stat-label">Cumulative cash flow</span>
                <span className="stat-value">{money(last.cashFlow)}</span>
              </div>
            </div>

            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Revenue</th>
                  <th>Gross profit</th>
                  <th>Net profit</th>
                  <th>Cash flow</th>
                </tr>
              </thead>
              <tbody>
                {projection.map((p) => (
                  <tr key={p.month}>
                    <td>M{p.month}</td>
                    <td className="num">{money(p.revenue)}</td>
                    <td className="num">{money(p.grossProfit)}</td>
                    <td className={`num ${p.netProfit < 0 ? "neg" : ""}`}>
                      {money(p.netProfit)}
                    </td>
                    <td className={`num ${p.cashFlow < 0 ? "neg" : ""}`}>
                      {money(p.cashFlow)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
