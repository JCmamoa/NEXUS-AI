#!/usr/bin/env node
/**
 * NEXUS OS — automated stress test.
 *
 * Drives the real UI (browser demo, mock backend) through every module and
 * verifies the core behaviours end-to-end while measuring timings, console
 * errors and JS heap usage.
 *
 * Usage:
 *   node scripts/stress.mjs [baseUrl] [iterations]
 *   BASE_URL=http://localhost:8080 ITERATIONS=3 npm run stress
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const BASE_URL = process.argv[2] || process.env.BASE_URL || "http://localhost:8080";
const ITERATIONS = Math.max(1, Number(process.argv[3] || process.env.ITERATIONS || 2));
const OUT_DIR = process.env.OUT_DIR || "stress-artifacts";

const report = {
  baseUrl: BASE_URL,
  iterations: ITERATIONS,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  durationMs: 0,
  steps: [],
  failures: [],
  consoleErrors: [],
  pageErrors: [],
  heapSamples: [],
};

const t0 = Date.now();

async function step(name, fn) {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    report.steps.push({ name, ms, ok: true });
    console.log(`  \u2713 ${name} (${ms} ms)`);
  } catch (err) {
    const ms = Date.now() - start;
    report.failures.push({ name, ms, error: String(err?.message || err) });
    report.steps.push({ name, ms, ok: false });
    console.log(`  \u2717 ${name} (${ms} ms): ${err?.message || err}`);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => report.pageErrors.push(String(err)));

  // ---------------------------------------------------------------- helpers
  const nav = async (name) => {
    await page.evaluate((label) => {
      const btn = [...document.querySelectorAll(".nav-item")].find((b) =>
        b.textContent.includes(label),
      );
      if (!btn) throw new Error(`nav item not found: ${label}`);
      btn.click();
    }, name);
    await page.waitForTimeout(150);
  };

  const clickText = async (selector, text) => {
    const locator = page.locator(selector, { hasText: text }).first();
    await locator.waitFor({ state: "visible", timeout: 10_000 });
    await locator.click();
  };

  const waitToast = async (pattern, timeout = 8_000) => {
    await page
      .locator(".toast", { hasText: pattern })
      .first()
      .waitFor({ state: "visible", timeout });
  };

  const shot = async (name) => {
    await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: false });
  };

  const readHeap = async () => {
    const bytes = await page.evaluate(() => globalThis.performance?.memory?.usedJSHeapSize ?? 0);
    if (bytes) report.heapSamples.push({ iteration: iteration, bytes });
  };

  // ------------------------------------------------------------ run cycles
  let iteration = 0;
  for (let i = 1; i <= ITERATIONS; i++) {
    iteration = i;
    console.log(`\nIteration ${i}/${ITERATIONS}`);
    const cycleStart = Date.now();

    await step("load app shell", async () => {
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await page.waitForSelector("text=Operational overview", { timeout: 15_000 });
    });

    // ------------------------------------------------------------ dashboard
    await step("dashboard: stat cards + activity feed", async () => {
      const text = await page.locator(".content").innerText();
      for (const label of [
        "DOCUMENTS PROCESSED",
        "PENDING APPROVAL",
        "ACTIVE AGENTS",
        "LIVE ACTIVITY",
      ]) {
        if (!text.includes(label)) throw new Error(`missing dashboard section: ${label}`);
      }
    });
    if (i === 1) await shot("01-dashboard");

    // ------------------------------------------------------------- pipeline
    await step("pipeline: simulate file arrival", async () => {
      await nav("Pipeline");
      await clickText("button", "Simulate file arrival");
      await waitToast(/Extracted|written|routed/i);
    });

    await step("pipeline: unreadable scan goes to approval queue", async () => {
      await clickText("button", "Simulate unreadable scan");
      await waitToast(/routed|approval|issues/i);
      const pending = await page.locator("table tbody tr", { hasText: "pending" }).count();
      if (pending === 0) throw new Error("no pending document in the approval queue");
    });

    await step("pipeline: human approve pending document", async () => {
      await clickText("table tbody tr button", "Approve");
      await waitToast(/approved|written/i);
    });
    if (i === 1) await shot("02-pipeline");

    // --------------------------------------------------------------- agents
    await step("agents: copilot suggestion + one-click approval", async () => {
      await nav("Agents");
      const select = page.locator(".form-block select");
      const copilotValue = await select.evaluate((el) => {
        const opt = [...el.options].find((o) => o.textContent.includes("Tier-1"));
        if (!opt) throw new Error("copilot agent option not found");
        return opt.value;
      });
      await select.selectOption(copilotValue);
      await page.locator(".form-block input[type=number]").fill("18");
      await clickText("button", "Run task");
      await page.locator(".result-banner").waitFor({ state: "visible", timeout: 10_000 });
      await clickText(".result-banner button", "Approve & execute");
      await waitToast(/executed|approved/i);
    });

    await step("agents: autonomous run blocked above guardrail ($75 > $20)", async () => {
      const select = page.locator(".form-block select");
      const autonomousValue = await select.evaluate((el) => {
        const opt = [...el.options].find((o) => o.textContent.includes("Order Triage"));
        if (!opt) throw new Error("autonomous agent option not found");
        return opt.value;
      });
      await select.selectOption(autonomousValue);
      await page.locator(".form-block input[type=number]").fill("75");
      await clickText("button", "Run task");
      // Wait for the NEW outcome, not the banner left over from the previous run.
      await page
        .locator(".result-banner.status-blocked")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
      const text = (await page.locator(".result-banner.status-blocked").first().innerText()).toLowerCase();
      if (!text.includes("exceeds autonomous limit")) {
        throw new Error(`guardrail message missing: ${text.slice(0, 120)}`);
      }
    });

    await step("agents: autonomous run inside guardrail ($5 <= $20) executes", async () => {
      await page.locator(".form-block input[type=number]").fill("5");
      await clickText("button", "Run task");
      await page
        .locator(".result-banner.status-executed")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
      const text = (await page.locator(".result-banner.status-executed").first().innerText()).toLowerCase();
      if (text.includes("block")) throw new Error("in-guardrail run was blocked");
    });
    if (i === 1) await shot("03-agents");

    // -------------------------------------------------------------- analyst
    await step("analyst: natural-language question renders a chart", async () => {
      await nav("Analyst");
      await page.locator(".chip").last().click();
      await page.locator("svg").first().waitFor({ state: "visible", timeout: 10_000 });
    });

    await step("analyst: chart type toggle (bar -> line -> bar)", async () => {
      await clickText(".segmented button", "Line");
      await page.waitForTimeout(120);
      await clickText(".segmented button", "Bar");
      await page.waitForTimeout(120);
    });

    await step("analyst: what-if sliders recalculate projection", async () => {
      const sliders = page.locator('input[type="range"]');
      const count = await sliders.count();
      if (count < 2) throw new Error(`expected sliders, found ${count}`);
      await sliders.nth(1).evaluate((el) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(el, "5.5");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await page.waitForTimeout(150);
    });

    await step("analyst: generated read-only SQL is visible", async () => {
      const text = await page.locator(".content").innerText();
      if (!/select/i.test(text) || !/from/i.test(text)) {
        throw new Error("generated SQL was not rendered");
      }
    });
    if (i === 1) await shot("04-analyst");

    // -------------------------------------------------------------- builder
    await step("builder: add palette blocks to the canvas", async () => {
      await nav("Builder");
      const palette = page.locator(".palette-item");
      await palette.nth(0).click();
      await palette.nth(2).click();
      const blocks = await page.locator(".canvas .block, .canvas [class*=block]").count();
      if (blocks === 0) throw new Error("no blocks rendered on the canvas");
    });

    await step("builder: rename and save the screen", async () => {
      await page.locator(".input-title").fill("Stress Test Portal");
      await clickText("button", "Save screen");
      await waitToast(/saved/i);
    });

    await step("builder: export screen package", async () => {
      const downloadPromise = page.waitForEvent("download", { timeout: 8_000 }).catch(() => null);
      await clickText("button", "Export");
      const download = await downloadPromise;
      if (download) {
        await download.delete();
      } else {
        await waitToast(/exported|export/i);
      }
    });
    if (i === 1) await shot("05-builder");

    await readHeap();
    const cycleMs = Date.now() - cycleStart;
    report.steps.push({ name: `cycle ${i} total`, ms: cycleMs, ok: true });
    console.log(`  \u2192 cycle ${i} completed in ${cycleMs} ms`);
  }

  await page.screenshot({ path: `${OUT_DIR}/06-final.png` });
  await browser.close();

  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - t0;

  const totalSteps = report.steps.filter((s) => !s.name.startsWith("cycle ")).length;
  const passed = totalSteps - report.failures.length;
  const summary = {
    ok:
      report.failures.length === 0 &&
      report.consoleErrors.length === 0 &&
      report.pageErrors.length === 0,
    stepsPassed: passed,
    stepsTotal: totalSteps,
    iterations: ITERATIONS,
    durationMs: report.durationMs,
    consoleErrors: report.consoleErrors.length,
    pageErrors: report.pageErrors.length,
    heapUsedMBAtEnd:
      report.heapSamples.length > 0
        ? Math.round(
            (report.heapSamples[report.heapSamples.length - 1].bytes / 1024 / 1024) * 10,
          ) / 10
        : null,
  };

  await writeFile(
    `${OUT_DIR}/stress-report.json`,
    JSON.stringify({ summary, ...report }, null, 2),
  );

  console.log("\n=================================================");
  console.log(`NEXUS OS stress test — ${summary.ok ? "PASS" : "FAIL"}`);
  console.log(`  steps:          ${passed}/${totalSteps} passed`);
  console.log(`  iterations:     ${ITERATIONS}`);
  console.log(`  duration:       ${(report.durationMs / 1000).toFixed(1)} s`);
  console.log(`  console errors: ${report.consoleErrors.length}`);
  console.log(`  page errors:    ${report.pageErrors.length}`);
  console.log(`  JS heap (end):  ${summary.heapUsedMBAtEnd ?? "n/a"} MB`);
  console.log(`  report:         ${OUT_DIR}/stress-report.json`);
  console.log("=================================================");

  if (!summary.ok) {
    if (report.failures.length) {
      console.log("\nFailed steps:");
      for (const f of report.failures) console.log(`  - ${f.name}: ${f.error}`);
    }
    if (report.consoleErrors.length) {
      console.log("\nConsole errors:");
      for (const e of report.consoleErrors.slice(0, 10)) console.log(`  - ${e}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
