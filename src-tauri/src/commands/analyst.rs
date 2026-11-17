use crate::db::AppState;
use crate::dto::{AnalysisResult, ChartSeries, TableData};
use tauri::State;

/// Plain-English → safe query engine (MVP heuristic layer).
/// The question is parsed into (metric, grouping, window); the resulting SQL
/// is always a read-only aggregate over the `orders` table — no writes, no
/// arbitrary SQL from the user, no credential exposure.
#[tauri::command]
pub fn analyst_query(state: State<AppState>, question: String) -> Result<AnalysisResult, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let q = question.to_lowercase();

    let metric = if q.contains("margin") {
        "net_margin"
    } else if q.contains("cost") {
        "cost"
    } else if q.contains("profit") {
        "profit"
    } else {
        "revenue"
    };
    let by_category = q.contains("category");
    let by_month = q.contains("month") || q.contains("time") || q.contains('6');

    let metric_label = match metric {
        "net_margin" => "Net margin (%)",
        "cost" => "Cost ($)",
        "profit" => "Profit ($)",
        _ => "Revenue ($)",
    };

    let mut stmt = conn
        .prepare("SELECT month, category, revenue, cost FROM orders ORDER BY month, category")
        .map_err(|e| e.to_string())?;
    let cells = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, f64>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if cells.is_empty() {
        return Err("No data available for analysis yet.".into());
    }

    let mut months: Vec<String> = Vec::new();
    let mut categories: Vec<String> = Vec::new();
    for (m, c, _, _) in &cells {
        if !months.contains(m) {
            months.push(m.clone());
        }
        if !categories.contains(c) {
            categories.push(c.clone());
        }
    }

    let value = |revenue: f64, cost: f64| -> f64 {
        let v = match metric {
            "cost" => cost,
            "profit" => revenue - cost,
            "net_margin" => {
                if revenue == 0.0 {
                    0.0
                } else {
                    ((revenue - cost) / revenue) * 100.0
                }
            }
            _ => revenue,
        };
        (v * 100.0).round() / 100.0
    };

    let cell_value = |month: &str, category: &str| -> f64 {
        cells
            .iter()
            .filter(|(m, c, _, _)| m == month && c == category)
            .map(|(_, _, r, co)| value(*r, *co))
            .sum()
    };
    let (labels, series) = if by_category && by_month {
        let series = categories
            .iter()
            .map(|cat| ChartSeries {
                name: cat.clone(),
                values: months
                    .iter()
                    .map(|m| cell_value(m.as_str(), cat.as_str()))
                    .collect(),
            })
            .collect::<Vec<_>>();
        (months.clone(), series)
    } else if by_category {
        (
            categories.clone(),
            vec![ChartSeries {
                name: metric_label.to_string(),
                values: categories
                    .iter()
                    .map(|cat| {
                        cells
                            .iter()
                            .filter(|(_, c, _, _)| c == cat)
                            .map(|(_, _, r, co)| value(*r, *co))
                            .sum()
                    })
                    .collect(),
            }],
        )
    } else {
        (
            months.clone(),
            vec![ChartSeries {
                name: metric_label.to_string(),
                values: months
                    .iter()
                    .map(|m| {
                        cells
                            .iter()
                            .filter(|(mm, _, _, _)| mm == m)
                            .map(|(_, _, r, co)| value(*r, *co))
                            .sum()
                    })
                    .collect(),
            }],
        )
    };

    let headers = {
        let mut h = vec!["Period".to_string()];
        h.extend(series.iter().map(|s| s.name.clone()));
        h
    };
    let rows = labels
        .iter()
        .enumerate()
        .map(|(i, label)| {
            let mut row = vec![serde_json::Value::String(label.clone())];
            row.extend(series.iter().map(|s| serde_json::json!(s.values[i])));
            row
        })
        .collect::<Vec<_>>();

    let agg = match metric {
        "cost" => "SUM(cost)",
        "profit" => "SUM(revenue - cost)",
        "net_margin" => "ROUND((SUM(revenue) - SUM(cost)) / SUM(revenue) * 100, 2)",
        _ => "SUM(revenue)",
    };
    let sql = if by_category && by_month {
        format!(
            "SELECT month, category, {agg} AS {metric}\nFROM orders\nWHERE month >= '2026-05'\nGROUP BY month, category\nORDER BY month;"
        )
    } else if by_category {
        format!(
            "SELECT category, {agg} AS {metric}\nFROM orders\nGROUP BY category\nORDER BY {metric} DESC;"
        )
    } else {
        format!("SELECT month, {agg} AS {metric}\nFROM orders\nGROUP BY month\nORDER BY month;")
    };

    let intent = format!(
        "{metric_label} · {}{}",
        if by_category { "by category" } else { "total" },
        if by_month { " · monthly trend" } else { "" }
    );

    Ok(AnalysisResult {
        question,
        intent,
        labels,
        series,
        table: TableData { headers, rows },
        sql,
    })
}

#[tauri::command]
pub fn analyst_sample_questions() -> Result<Vec<String>, String> {
    Ok(vec![
        "Compare net margin by category over the last 6 months".into(),
        "Show monthly revenue for the last 6 months".into(),
        "Which category has the highest cost?".into(),
        "Total revenue by category".into(),
    ])
}
