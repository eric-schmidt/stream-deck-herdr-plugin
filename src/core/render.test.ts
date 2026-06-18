// src/core/render.test.ts
import { test, expect } from "bun:test";
import { renderKeySvg, renderPagerSvg, renderAttentionSvg } from "./render";

function decode(uri: string): string {
  expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
  return decodeURIComponent(uri.slice("data:image/svg+xml,".length));
}

test("renderKeySvg paints the status color, glyph and escaped label", () => {
  const svg = decode(renderKeySvg({ label: "a&b", status: "working", agent: "claude", pinned: false }));
  expect(svg).toContain("#E8901E");
  expect(svg).toContain("●");
  expect(svg).toContain("a&amp;b");
});

test("renderKeySvg wraps a long label onto up to 3 lines", () => {
  const svg = decode(renderKeySvg({ label: "LMManagementSystem", status: "idle", agent: "claude", pinned: false }));
  const textCount = (svg.match(/<text/g) ?? []).length;
  // 1 status glyph + 3 wrapped label lines (claude's badge is an icon <g>, not <text>)
  expect(textCount).toBe(4);
  expect(svg).toContain("LMManage");
});

test("renderKeySvg renders a monochrome icon badge for a known agent", () => {
  const svg = decode(renderKeySvg({ label: "proj", status: "working", agent: "claude", pinned: false }));
  expect(svg).toContain("<g transform");
  expect(svg).toContain('fill-rule="evenodd"');
  expect(svg).not.toContain(">CL<"); // icon replaces the text code
});

test("renderKeySvg matches the agent type case-insensitively", () => {
  const svg = decode(renderKeySvg({ label: "proj", status: "idle", agent: "CURSOR", pinned: false }));
  expect(svg).toContain("<g transform");
});

test("renderKeySvg falls back to a 2-letter code when no icon exists", () => {
  // droid has no Lobehub logo; unknown agents also fall back to the text code.
  const droid = decode(renderKeySvg({ label: "proj", status: "idle", agent: "droid", pinned: false }));
  expect(droid).toContain(">DR<");
  const unknown = decode(renderKeySvg({ label: "proj", status: "idle", agent: "zephyr", pinned: false }));
  expect(unknown).toContain(">ZE<");
});

test("renderKeySvg draws a pin marker only when pinned", () => {
  const on = decode(renderKeySvg({ label: "proj", status: "working", agent: "claude", pinned: true }));
  expect(on).toContain('<circle cx="126" cy="15"');
  const off = decode(renderKeySvg({ label: "proj", status: "working", agent: "claude", pinned: false }));
  expect(off).not.toContain('<circle cx="126" cy="15"');
});

test("renderKeySvg empty slot is black with no label", () => {
  const svg = decode(renderKeySvg(null));
  expect(svg).toContain("#000");
});

test("renderAttentionSvg colors by worst status and shows the count", () => {
  const svg = decode(renderAttentionSvg({ count: 3, attention: "blocked" }));
  expect(svg).toContain("#D13438"); // blocked color
  expect(svg).toContain(">3<");
});

test("renderAttentionSvg is dim when nothing needs attention", () => {
  const svg = decode(renderAttentionSvg({ count: 0, attention: null }));
  expect(svg).toContain("#0a0a0a");
  expect(svg).toContain(">0<");
});

test("renderPagerSvg shows page indicator and badge when attention present", () => {
  const svg = decode(renderPagerSvg({ page: 0, total: 2, attention: "blocked", count: 1 }));
  expect(svg).toContain("1/2");
  expect(svg).toContain("#D13438"); // blocked badge
  expect(svg).toContain("▲");
});

test("renderPagerSvg shows count when more than one off-page attention", () => {
  const svg = decode(renderPagerSvg({ page: 0, total: 3, attention: "done", count: 4 }));
  expect(svg).toContain(">4<"); // count rendered instead of glyph
});

test("renderPagerSvg single page has no badge", () => {
  const svg = decode(renderPagerSvg({ page: 0, total: 1, attention: null, count: 0 }));
  expect(svg).toContain("1/1");
  expect(svg).not.toContain("circle");
});

test("renderPagerSvg single page renders no badge even with attention", () => {
  const svg = decode(renderPagerSvg({ page: 0, total: 1, attention: "blocked", count: 3 }));
  expect(svg).toContain("1/1");
  expect(svg).not.toContain("circle");
});
