// IPC layer: routes commands to the Tauri/Rust backend when running inside
// the desktop shell, or to an in-memory demo backend when running in a plain
// browser (`npm run dev`). Both sides implement the same command contract.
import { invoke } from "@tauri-apps/api/core";
import * as mock from "./mockBackend";

export function isNative(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Send every argument under both its snake_case and camelCase key so the
// payload matches the Rust parameter names regardless of Tauri's key
// normalization on either side. Unknown keys are ignored by both backends.
function withAliases(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };
  for (const [key, value] of Object.entries(args)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    if (camel !== key) out[camel] = value;
  }
  return out;
}

export async function api<T>(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const payload = withAliases(args);
  if (isNative()) {
    return await invoke<T>(cmd, payload);
  }
  const fn = (mock as Record<string, unknown>)[cmd];
  if (typeof fn !== "function") {
    throw new Error(`Unknown command: ${cmd}`);
  }
  return (fn as (a: Record<string, unknown>) => Promise<T>)(payload);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
