import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/ipc";
import type { BlockType, Screen, ScreenBlock } from "../../types";
import type { Notify } from "../../App";

interface Props {
  notify: Notify;
}

const PALETTE: { type: BlockType; label: string; hint: string }[] = [
  { type: "form", label: "Form", hint: "input fields bound to a table" },
  { type: "table", label: "Editable table", hint: "CRUD over any table" },
  { type: "action", label: "Action button", hint: "triggers an agent or flow" },
  { type: "metric", label: "Metric card", hint: "live KPI from your data" },
];

const uid = () => `b-${Math.random().toString(36).slice(2, 9)}`;

export default function BuilderModule({ notify }: Props) {
  const [screenName, setScreenName] = useState("Internal Returns Portal");
  const [blocks, setBlocks] = useState<ScreenBlock[]>([
    { id: uid(), type: "metric", title: "Open returns", span: 1 },
    { id: uid(), type: "table", title: "Return requests", span: 2 },
    { id: uid(), type: "form", title: "Register return", span: 1 },
    { id: uid(), type: "action", title: "Trigger triage agent", span: 1 },
  ]);
  const [saved, setSaved] = useState<Screen[]>([]);
  const [preview, setPreview] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [exported, setExported] = useState("");

  const reload = useCallback(async () => {
    try {
      setSaved(await api<Screen[]>("builder_list_screens"));
    } catch (e) {
      notify(`Failed to list screens: ${String(e)}`, "error");
    }
  }, [notify]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addBlock = (type: BlockType) => {
    const meta = PALETTE.find((p) => p.type === type)!;
    setBlocks((prev) => [
      ...prev,
      { id: uid(), type, title: meta.label, span: 1 },
    ]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const newType = e.dataTransfer.getData("application/x-nexus-new") as BlockType;
    const moveIndex = e.dataTransfer.getData("application/x-nexus-move");
    if (newType) {
      addBlock(newType);
      return;
    }
    if (moveIndex !== "") {
      const from = Number(moveIndex);
      setBlocks((prev) => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(from, 0, moved);
        return next;
      });
    }
  };

  const updateBlock = (id: string, patch: Partial<ScreenBlock>) =>
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );

  const removeBlock = (id: string) =>
    setBlocks((prev) => prev.filter((b) => b.id !== id));

  const save = async () => {
    if (!screenName.trim()) return notify("Screen name is required", "error");
    try {
      await api("builder_save_screen", { name: screenName.trim(), blocks });
      notify(`Screen "${screenName.trim()}" saved`, "success");
      await reload();
    } catch (e) {
      notify(`Save failed: ${String(e)}`, "error");
    }
  };

  const exportScreen = async (id?: string) => {
    try {
      if (id) {
        const pkg = await api<string>("builder_export_screen", { id });
        setExported(pkg);
        download(pkg, "nexus-screen.json");
        notify("Configuration package exported", "success");
      } else {
        const pkg = JSON.stringify(
          { format: "nexus-os/screen-package", version: 1, screen: { name: screenName, blocks } },
          null,
          2,
        );
        setExported(pkg);
        download(pkg, "nexus-screen.json");
        notify("Current canvas exported", "success");
      }
    } catch (e) {
      notify(`Export failed: ${String(e)}`, "error");
    }
  };

  const importScreen = async () => {
    try {
      const screen = await api<Screen>("builder_import_screen", {
        package_json: importText,
      });
      notify(`Imported "${screen.name}"`, "success");
      setScreenName(screen.name);
      setBlocks(screen.blocks);
      setImportText("");
      setImportOpen(false);
      await reload();
    } catch (e) {
      notify(`Import failed: ${String(e)}`, "error");
    }
  };

  const deleteScreen = async (id: string) => {
    try {
      await api("builder_delete_screen", { id });
      notify("Screen removed", "info");
      await reload();
    } catch (e) {
      notify(`Delete failed: ${String(e)}`, "error");
    }
  };

  const loadScreen = (s: Screen) => {
    setScreenName(s.name);
    setBlocks(s.blocks.map((b) => ({ ...b, id: uid() })));
    notify(`Loaded "${s.name}" into the canvas`, "info");
  };

  return (
    <div className="stack">
      <div className="builder-layout">
        <div className="panel palette">
          <div className="panel-head">
            <h2>Blocks</h2>
            <span className="badge badge-muted">drag & drop</span>
          </div>
          {PALETTE.map((p) => (
            <button
              key={p.type}
              className="palette-item"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-nexus-new", p.type);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addBlock(p.type)}
            >
              <span className={`block-glyph glyph-${p.type}`} />
              <span>
                <strong>{p.label}</strong>
                <small>{p.hint}</small>
              </span>
            </button>
          ))}
          <p className="hint">
            Click or drag a block onto the canvas. Every block reads from the
            same connectors already configured in the app.
          </p>
        </div>

        <div className="panel canvas-panel">
          <div className="panel-head">
            <input
              className="input input-title"
              value={screenName}
              onChange={(e) => setScreenName(e.target.value)}
              aria-label="Screen name"
            />
            <div className="row">
              <button
                className={`btn btn-sm ${preview ? "" : "btn-ghost"}`}
                onClick={() => setPreview((p) => !p)}
              >
                {preview ? "Edit" : "Preview"}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => void exportScreen()}>
                Export
              </button>
              <button className="btn btn-sm" onClick={() => void save()}>
                Save screen
              </button>
            </div>
          </div>

          <div
            className={`canvas ${preview ? "canvas-preview" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            {blocks.map((b, i) => (
              <div
                key={b.id}
                className={`block span-${b.span} ${preview ? "block-preview" : ""}`}
                draggable={!preview}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-nexus-move", String(i));
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                <div className="block-head">
                  <span className={`block-glyph glyph-${b.type}`} />
                  <strong>{b.title}</strong>
                  {!preview && (
                    <button
                      className="block-x"
                      onClick={() => removeBlock(b.id)}
                      aria-label="Remove block"
                    >
                      ×
                    </button>
                  )}
                </div>

                {preview ? (
                  <BlockPreview type={b.type} />
                ) : (
                  <>
                    <input
                      className="input input-sm"
                      value={b.title}
                      onChange={(e) => updateBlock(b.id, { title: e.target.value })}
                      aria-label="Block title"
                    />
                    <div className="span-picker">
                      Width:
                      {[1, 2, 3].map((s) => (
                        <button
                          key={s}
                          className={b.span === s ? "on" : ""}
                          onClick={() =>
                            updateBlock(b.id, { span: s as 1 | 2 | 3 })
                          }
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
            {blocks.length === 0 && (
              <div className="empty canvas-empty">
                Drag blocks here to assemble your operational screen.
              </div>
            )}
          </div>
        </div>

        <div className="panel saved-panel">
          <div className="panel-head">
            <h2>Saved screens</h2>
            <button className="btn btn-sm btn-ghost" onClick={() => setImportOpen((v) => !v)}>
              Import
            </button>
          </div>
          <ul className="saved-list">
            {saved.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <small className="muted">
                    {s.blocks.length} blocks ·{" "}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </small>
                </div>
                <div className="row-right">
                  <button className="btn btn-sm" onClick={() => loadScreen(s)}>
                    Load
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => void exportScreen(s.id)}
                  >
                    Export
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => void deleteScreen(s.id)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
            {saved.length === 0 && <li className="empty">Nothing saved yet.</li>}
          </ul>

          {importOpen && (
            <div className="form-block">
              <span className="label-like">Paste a screen package</span>
              <textarea
                className="input"
                rows={5}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='{"format":"nexus-os/screen-package", ...}'
              />
              <button className="btn" onClick={() => void importScreen()}>
                Import package
              </button>
            </div>
          )}

          {exported && (
            <div className="form-block">
              <span className="label-like">Last exported package</span>
              <pre className="sql sql-small">{exported}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BlockPreview({ type }: { type: BlockType }) {
  if (type === "metric") {
    return (
      <div className="preview-metric">
        <span>128</span>
        <small>last 30 days</small>
      </div>
    );
  }
  if (type === "table") {
    return (
      <table className="table table-compact">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>Return A-12</td>
            <td>
              <span className="badge badge-warn">open</span>
            </td>
          </tr>
          <tr>
            <td>2</td>
            <td>Return A-13</td>
            <td>
              <span className="badge badge-ok">done</span>
            </td>
          </tr>
        </tbody>
      </table>
    );
  }
  if (type === "form") {
    return (
      <div className="preview-form">
        <span className="fake-input">Order number</span>
        <span className="fake-input">Reason</span>
        <span className="fake-btn">Submit</span>
      </div>
    );
  }
  return (
    <div className="preview-form">
      <span className="fake-btn">Run agent</span>
    </div>
  );
}

function download(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
