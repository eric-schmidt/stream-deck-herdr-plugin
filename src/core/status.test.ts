// src/core/status.test.ts
import { test, expect } from "bun:test";
import { presentation, isAttention, ATTENTION_RANK } from "./status";

test("presentation maps each status to its color + glyph", () => {
  expect(presentation("working")).toEqual({ color: "#E8901E", glyph: "●" });
  expect(presentation("blocked")).toEqual({ color: "#D13438", glyph: "▲" });
  expect(presentation("done")).toEqual({ color: "#2B7FFF", glyph: "✓" });
  expect(presentation("idle")).toEqual({ color: "#6B7280", glyph: "○" });
  expect(presentation("unknown")).toEqual({ color: "#1F2937", glyph: "·" });
});

test("attention covers blocked/done/working but not idle/unknown, ranked", () => {
  expect(isAttention("blocked")).toBe(true);
  expect(isAttention("done")).toBe(true);
  expect(isAttention("working")).toBe(true);
  expect(isAttention("idle")).toBe(false);
  expect(isAttention("unknown")).toBe(false);
  expect(ATTENTION_RANK.blocked).toBeGreaterThan(ATTENTION_RANK.done);
  expect(ATTENTION_RANK.done).toBeGreaterThan(ATTENTION_RANK.working);
});
