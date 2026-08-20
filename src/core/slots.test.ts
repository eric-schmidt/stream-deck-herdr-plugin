// src/core/slots.test.ts
import { test, expect } from "bun:test";
import { assignSlots, type SlotKey } from "./slots";

const key = (id: string, row: number, column: number, deviceId = "deck-a"): SlotKey => ({
  id,
  deviceId,
  row,
  column,
});

test("keys fill in reading order: left-to-right, top-to-bottom", () => {
  // Deliberately shuffled: assignment must come from position, not arrival order, or slots
  // would shuffle between launches.
  const { indexById, pageSize } = assignSlots([
    key("c", 1, 0),
    key("a", 0, 0),
    key("d", 1, 1),
    key("b", 0, 1),
  ]);
  expect([...indexById.entries()].sort()).toEqual([
    ["a", 0],
    ["b", 1],
    ["c", 2],
    ["d", 3],
  ]);
  expect(pageSize).toBe(4);
});

test("gaps do not create empty slots — indices stay dense", () => {
  // A key at column 4 with nothing beside it is still slot 1, not slot 5.
  const { indexById, pageSize } = assignSlots([key("a", 0, 0), key("b", 0, 4)]);
  expect(indexById.get("a")).toBe(0);
  expect(indexById.get("b")).toBe(1);
  expect(pageSize).toBe(2);
});

test("no keys placed means an unknown page size, not zero", () => {
  const { indexById, pageSize } = assignSlots([]);
  expect(pageSize).toBe(null);
  expect(indexById.size).toBe(0);
});

test("devices mirror: each ranks its own keys from 0", () => {
  const { indexById } = assignSlots([
    key("a1", 0, 0, "deck-a"),
    key("a2", 0, 1, "deck-a"),
    key("b1", 0, 0, "deck-b"),
    key("b2", 0, 1, "deck-b"),
  ]);
  // Both decks show the same two agents rather than extending to four.
  expect(indexById.get("a1")).toBe(0);
  expect(indexById.get("b1")).toBe(0);
  expect(indexById.get("a2")).toBe(1);
  expect(indexById.get("b2")).toBe(1);
});

test("page size is the largest per-device count, not the total", () => {
  // 5-key deck + 3-key deck: the page must hold 5 so the bigger deck fills, and the
  // smaller one simply shows the first 3 of the same page.
  const five = [0, 1, 2, 3, 4].map((c) => key(`a${c}`, 0, c, "deck-a"));
  const three = [0, 1, 2].map((c) => key(`b${c}`, 0, c, "deck-b"));
  expect(assignSlots([...five, ...three]).pageSize).toBe(5);
});

test("rows order before columns", () => {
  const { indexById } = assignSlots([key("later", 1, 0), key("earlier", 0, 4)]);
  expect(indexById.get("earlier")).toBe(0);
  expect(indexById.get("later")).toBe(1);
});
