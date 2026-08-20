// src/core/pagination.test.ts
import { test, expect } from "bun:test";
import {
  pageCount,
  clampPage,
  pageSlice,
  offPageWorstAttention,
  offPageAttentionCount,
} from "./pagination";
import type { Agent } from "./agents";

const mk = (status: Agent["status"], paneId: string): Agent => ({
  name: "claude",
  status,
  cwd: "/x/proj",
  paneId,
  workspaceId: "w1",
  focused: false,
  terminalTitle: "",
});

test("pageCount has a floor of 1", () => {
  expect(pageCount(0, 5)).toBe(1);
  expect(pageCount(5, 5)).toBe(1);
  expect(pageCount(6, 5)).toBe(2);
  expect(pageCount(11, 5)).toBe(3);
});

test("clampPage keeps page inside range", () => {
  expect(clampPage(2, 1)).toBe(0);
  expect(clampPage(-1, 3)).toBe(0);
  expect(clampPage(5, 3)).toBe(2);
});

test("pageSlice returns the window for a page", () => {
  const agents = ["a", "b", "c", "d", "e", "f"].map((p) => mk("idle", p));
  expect(pageSlice(agents, 1, 5).map((a) => a.paneId)).toEqual(["f"]);
});

test("offPageWorstAttention ranks blocked > done and ignores working + on-page", () => {
  const agents = [
    ...["p0", "p1", "p2", "p3", "p4"].map((p) => mk("idle", p)), // page 0
    mk("working", "p5"),
    mk("done", "p6"),
    mk("blocked", "p7"),
  ];
  expect(offPageWorstAttention(agents, 0, 5)).toBe("blocked");
  // working is NOT a notify state, so only done + blocked count
  expect(offPageAttentionCount(agents, 0, 5)).toBe(2);
  // when the blocked agent is on the current page, it no longer counts off-page
  expect(offPageWorstAttention(agents, 1, 5)).toBe(null);
});

test("working off-page never raises the pager badge", () => {
  const agents = [
    ...["p0", "p1", "p2", "p3", "p4"].map((p) => mk("idle", p)),
    mk("working", "p5"),
    mk("working", "p6"),
  ];
  expect(offPageWorstAttention(agents, 0, 5)).toBe(null);
  expect(offPageAttentionCount(agents, 0, 5)).toBe(0);
});

test("idle/unknown off-page produce no badge", () => {
  const agents = [
    ...["p0", "p1", "p2", "p3", "p4"].map((p) => mk("working", p)),
    mk("idle", "p5"),
    mk("unknown", "p6"),
  ];
  expect(offPageWorstAttention(agents, 0, 5)).toBe(null);
  expect(offPageAttentionCount(agents, 0, 5)).toBe(0);
});

// A null pageSize means no slot key has reported yet: nothing is paged, so it is all one
// page holding every agent — and nothing can be off-page.
test("a null pageSize means unpaged, and nothing is off-page", () => {
  const agents = [mk("blocked", "a"), mk("done", "b"), mk("idle", "c")];
  expect(pageCount(12, null)).toBe(1);
  expect(pageCount(0, null)).toBe(1);
  expect(pageSlice(agents, 0, null).map((a) => a.paneId)).toEqual(["a", "b", "c"]);
  expect(offPageAttentionCount(agents, 0, null)).toBe(0);
  expect(offPageWorstAttention(agents, 0, null)).toBe(null);
});
