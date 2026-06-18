// src/core/store.test.ts
import { test, expect } from "bun:test";
import { createAgentStore } from "./store";
import type { RawAgent } from "./agents";

const six: RawAgent[] = Array.from({ length: 6 }, (_, i) => ({
  agent: "claude",
  agent_status: "idle",
  cwd: `/x/p${i}`,
  pane_id: `w1:p${i}`,
  workspace_id: "w1",
}));

test("pollNow loads + normalizes agents and notifies subscribers", async () => {
  const store = createAgentStore({ fetchAgents: async () => six });
  const seen: number[] = [];
  store.subscribe((s) => seen.push(s.agents.length)); // initial emit = 0
  await store.pollNow();
  expect(store.getState().agents).toHaveLength(6);
  expect(seen).toEqual([0, 6]);
});

test("nextPage wraps using pageCount", async () => {
  const store = createAgentStore({ fetchAgents: async () => six });
  await store.pollNow(); // 6 agents -> 2 pages
  store.nextPage();
  expect(store.getState().page).toBe(1);
  store.nextPage();
  expect(store.getState().page).toBe(0);
});

test("a single failure keeps last-good; a second failure empties", async () => {
  let mode: "ok" | "fail" = "ok";
  const store = createAgentStore({
    fetchAgents: async () => {
      if (mode === "fail") throw new Error("herdr down");
      return six;
    },
  });
  await store.pollNow();
  expect(store.getState().agents).toHaveLength(6);
  mode = "fail";
  await store.pollNow();
  expect(store.getState().agents).toHaveLength(6); // kept
  await store.pollNow();
  expect(store.getState().agents).toHaveLength(0); // emptied
});

test("page clamps when the agent list shrinks", async () => {
  let agents = six;
  const store = createAgentStore({ fetchAgents: async () => agents });
  await store.pollNow();
  store.nextPage();
  expect(store.getState().page).toBe(1);
  agents = six.slice(0, 3); // now 1 page
  await store.pollNow();
  expect(store.getState().page).toBe(0);
});
