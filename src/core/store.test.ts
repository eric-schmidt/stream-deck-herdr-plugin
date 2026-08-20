// src/core/store.test.ts
import { test, expect } from "bun:test";
import { createAgentStore } from "./store";
import type { RawAgent } from "./agents";

const six: RawAgent[] = Array.from({ length: 6 }, (_, i) => ({
  agent: "claude",
  agent_status: "working", // non-idle: idle agents are filtered out of the store
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
  // Explicit pageSize: with none the store is unpaged (one page), so there is nothing to
  // wrap to. In the plugin this value arrives from the placed slot keys.
  const store = createAgentStore({ fetchAgents: async () => six, pageSize: 5 });
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

test("the store mirrors herdr: every agent, in order, idle included", async () => {
  const mixed: RawAgent[] = [
    { agent: "a", agent_status: "working", cwd: "/x/a", pane_id: "w1:p1", workspace_id: "w1" },
    { agent: "b", agent_status: "idle", cwd: "/x/b", pane_id: "w1:p2", workspace_id: "w1" },
    { agent: "c", agent_status: "blocked", cwd: "/x/c", pane_id: "w1:p3", workspace_id: "w1" },
    { agent: "d", agent_status: "idle", cwd: "/x/d", pane_id: "w1:p4", workspace_id: "w1" },
  ];
  const store = createAgentStore({ fetchAgents: async () => mixed });
  await store.pollNow();
  expect(store.getState().agents.map((a) => a.paneId)).toEqual([
    "w1:p1",
    "w1:p2",
    "w1:p3",
    "w1:p4",
  ]);
});

test("page clamps when the agent list shrinks", async () => {
  let agents = six;
  const store = createAgentStore({ fetchAgents: async () => agents, pageSize: 5 });
  await store.pollNow();
  store.nextPage();
  expect(store.getState().page).toBe(1);
  agents = six.slice(0, 3); // now 1 page
  await store.pollNow();
  expect(store.getState().page).toBe(0);
});

test("setPageSize drives paging and no-ops when unchanged", async () => {
  const store = createAgentStore({ fetchAgents: async () => six });
  await store.pollNow();
  // Unpaged until a slot key reports: everything is on one page.
  expect(store.getPageSize()).toBe(null);
  store.nextPage();
  expect(store.getState().page).toBe(0);

  // Three slot keys placed -> 6 agents across 2 pages.
  store.setPageSize(3);
  expect(store.getPageSize()).toBe(3);
  store.nextPage();
  expect(store.getState().page).toBe(1);

  // Repeat calls with the same value must not emit (slot keys appear one at a time).
  let emits = 0;
  store.subscribe(() => emits++); // subscribe emits once immediately
  store.setPageSize(3);
  expect(emits).toBe(1);

  // Growing the page size collapses to one page and clamps the current page back.
  store.setPageSize(10);
  expect(store.getState().page).toBe(0);
});

test("setPageSize clamps to a minimum of one whole slot", async () => {
  const store = createAgentStore({ fetchAgents: async () => six });
  await store.pollNow();
  store.setPageSize(0);
  expect(store.getPageSize()).toBe(1);
  store.setPageSize(3.7);
  expect(store.getPageSize()).toBe(3);
});
