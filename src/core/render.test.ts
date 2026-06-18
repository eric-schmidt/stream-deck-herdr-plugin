// src/core/render.test.ts
import { test, expect } from "bun:test";
import { renderKeySvg, renderPagerSvg } from "./render";

function decode(uri: string): string {
  expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
  return decodeURIComponent(uri.slice("data:image/svg+xml,".length));
}

test("renderKeySvg paints the status color, glyph and escaped label", () => {
  const svg = decode(renderKeySvg({ label: "a&b", status: "working" }));
  expect(svg).toContain("#E8901E");
  expect(svg).toContain("●");
  expect(svg).toContain("a&amp;b");
});

test("renderKeySvg empty slot is black with no label", () => {
  const svg = decode(renderKeySvg(null));
  expect(svg).toContain("#000");
});

test("renderPagerSvg shows page indicator and badge when attention present", () => {
  const svg = decode(renderPagerSvg({ page: 0, total: 2, attention: "blocked", count: 1 }));
  expect(svg).toContain("1/2");
  expect(svg).toContain("#D13438"); // blocked badge
  expect(svg).toContain("▲");
});

test("renderPagerSvg shows count when more than one off-page attention", () => {
  const svg = decode(renderPagerSvg({ page: 0, total: 3, attention: "working", count: 4 }));
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
