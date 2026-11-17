# Contributing to NEXUS OS

Thanks for taking the time to contribute! This document explains how to set up
the project, run it, and submit changes.

## Ground rules

- All code, comments, documentation and UI copy are written in **English**.
- Keep the app **local-first**: no telemetry, no network calls on behalf of the
  user without an explicit feature and opt-in.
- The frontend must never special-case the backend. Anything the UI needs goes
  through the **17-command IPC contract** in `src/lib/ipc.ts`, implemented in
  *both* `src/lib/mockBackend.ts` and the Rust command layer.

## Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 20 or newer |
| Rust | stable (1.75+) via [rustup](https://rustup.rs) |
| Linux system libs | see below |

Debian / Ubuntu:

```bash
sudo apt install -y pkg-config libwebkit2gtk-4.1-dev build-essential \
  libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

macOS and Windows: follow the
[Tauri 2 prerequisites](https://tauri.app/start/prerequisites/).

## Setup

```bash
git clone https://github.com/JCmamoa/NEXUS-AI.git
cd NEXUS-AI
npm install
```

## Running

```bash
# Browser demo — no Rust required, in-memory seeded backend
npm run dev           # http://localhost:5173

# Native desktop app (Tauri + SQLite)
npm run tauri dev

# Production bundle
npm run tauri build   # .deb / .AppImage · .msi · .dmg
```

## Checks before opening a pull request

```bash
npm run build                                # TypeScript strict + Vite build
cd src-tauri && cargo fmt --check && cargo check
```

CI runs the same checks on every push and pull request.

## Project layout

```
src/
  modules/        one folder per module (dashboard, pipeline, agents, analyst, builder)
  lib/            ipc.ts (contract) · mockBackend.ts (demo) · whatif.ts (projection)
  components/     Sidebar, StatCard, hand-rolled SVG Chart
src-tauri/src/
  commands/       one file per module, registered in lib.rs
  db.rs           schema, seeding, shared state
  dto.rs          serde DTOs (camelCase ↔ TypeScript)
```

## Adding or changing an IPC command

1. Add the DTOs to `src/types.ts` and `src-tauri/src/dto.rs` (keep names in
   sync — the Rust side serializes camelCase).
2. Implement the command in `src-tauri/src/commands/<module>.rs` and register
   it in `src-tauri/src/lib.rs`.
3. Implement the same command in `src/lib/mockBackend.ts` so the browser demo
   keeps working.
4. Expose a typed wrapper in `src/lib/ipc.ts`.
5. Update the command table in `README.md`.

## Commits and pull requests

- Use short, imperative commit subjects (e.g. `Fix guardrail comparison`).
- Keep pull requests focused: one feature or fix per PR.
- Describe *what* changed and *why*; include screenshots/GIFs for UI changes.
- Reference issues where relevant (`Closes #12`).

## Reporting bugs

Open an issue with:

- steps to reproduce,
- expected vs. actual behaviour,
- OS and app version,
- the browser console output (demo mode) or terminal output (native mode).

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).
