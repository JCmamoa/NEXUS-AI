# Changelog

All notable changes to NEXUS OS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Real folder watcher daemon (`notify` + `tauri-plugin-fs`) with native
  notifications for pending approvals.
- Live connectors: PostgreSQL / MySQL drivers, Excel/CSV parser, IMAP and
  REST connector UI with OS-keychain credential vault.
- LLM-backed NL→SQL (with a local offline model option) behind the same
  read-only query validator.
- Document extraction pipeline on the Rust side (OCR + field rules engine).
- CI packaging matrix (.AppImage / .deb / .msi / .dmg) and code signing.
- Screen package signing so shared configurations can be trusted.

## [0.1.0] — 2026-11-17

First public MVP release.

### Added
- **Desktop shell** — Tauri 2 + Rust backend with a React 19 + Vite +
  TypeScript (strict) frontend, dark theme, no UI framework.
- **Module A · Pipeline Engine** — simulated document arrival (PDF / image /
  CSV), field extraction, business-rule validation, clean records written to
  SQLite, and a Pending Approval queue for unreadable or discrepant files.
- **Module B · Agents & Internal Tools Hub** — specialized agents with tool
  grants, Copilot Mode (one-click approval of suggested actions), Autonomous
  Mode with hard guardrails (e.g. refunds up to US$ 20), and a local
  read-only audit trail.
- **Module C · Conversational Analyst & What-If** — plain-English questions
  parsed into a safe, read-only aggregate SQL query (always shown to the
  user), interactive hand-rolled SVG charts, result tables, and real-time
  what-if sliders (price, conversion, traffic, shipping, ad spend).
- **Module D · Rapid Interface Builder** — click/drag block palette (form,
  editable table, action button, metric card) over a 3-column canvas, screen
  rename, save/load, and export/import of `nexus-os/screen-package` JSON.
- **Dual backend contract** — the same 17-command IPC surface implemented by
  the Rust command layer (SQLite via `rusqlite`, bundled) and an in-browser
  mock backend, so the full UI runs with `npm run dev` before the native
  shell exists.
- **SQLite persistence** — schema, demo seeding and shared state in the OS
  app-data directory.
- **Tooling** — stdlib-only icon generator (`scripts/gen_icons.py`),
  MIT license, module demo GIFs and screenshots in `docs/`.

### Verified
- Frontend: TypeScript strict build clean, zero console errors, all four
  modules exercised end-to-end in the browser demo.
- Backend: Rust crate formatted (`cargo fmt`) and type-checked
  (`cargo check`).
