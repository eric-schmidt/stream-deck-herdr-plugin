// src/core/agents.test.ts
import { test, expect } from "bun:test";
import { normalize, visibleAgents, labelFor, type RawAgent } from "./agents";
import fixture from "../../tests/fixtures/agent-list.json";

const raw = fixture.result.agents as RawAgent[];

test("normalize maps fields and stable-sorts by workspace then pane", () => {
  const agents = normalize(raw);
  expect(agents.map((a) => a.paneId)).toEqual(["w5:p1", "w7:p2", "wG:p1", "wJ:p1"]);
  expect(agents[0]).toEqual({
    name: "claude",
    status: "idle",
    cwd: "/Users/timvdhoorn/Devops/Logidirect/Loftware-Automation-Proxy",
    paneId: "w5:p1",
    workspaceId: "w5",
    focused: false,
  });
});

test("normalize coerces unknown status and drops entries without pane_id", () => {
  const agents = normalize([
    { agent: "x", agent_status: "weird", cwd: "/a/b", pane_id: "w1:p1", workspace_id: "w1" },
    { agent: "y", agent_status: "idle", cwd: "/c" },
  ] as RawAgent[]);
  expect(agents).toHaveLength(1);
  expect(agents[0].status).toBe("unknown");
});

test("visibleAgents drops idle agents and keeps the rest in order", () => {
  const agents = normalize([
    { agent: "x", agent_status: "idle", cwd: "/a", pane_id: "w1:p1", workspace_id: "w1" },
    { agent: "y", agent_status: "working", cwd: "/b", pane_id: "w1:p2", workspace_id: "w1" },
    { agent: "z", agent_status: "blocked", cwd: "/c", pane_id: "w1:p3", workspace_id: "w1" },
    { agent: "w", agent_status: "done", cwd: "/d", pane_id: "w1:p4", workspace_id: "w1" },
    { agent: "v", agent_status: "weird", cwd: "/e", pane_id: "w1:p5", workspace_id: "w1" },
  ] as RawAgent[]);
  // idle dropped; working/blocked/done/unknown kept
  expect(visibleAgents(agents).map((a) => a.status)).toEqual([
    "working",
    "blocked",
    "done",
    "unknown",
  ]);
});

test("labelFor uses cwd basename, truncates, disambiguates duplicates", () => {
  const agents = normalize(raw);
  const lmms = agents.find((a) => a.paneId === "w7:p2")!;
  expect(labelFor(lmms, agents)).toBe("LMManagementSystem"); // full basename (<= 24 chars)
  const dupA = { name: "c", status: "idle", cwd: "/x/app", paneId: "w1:p1", workspaceId: "w1", focused: false } as const;
  const dupB = { name: "c", status: "idle", cwd: "/y/app", paneId: "w2:p3", workspaceId: "w2", focused: false } as const;
  expect(labelFor(dupA, [dupA, dupB])).toBe("app #1");
});

test("labelFor numbers long duplicate names so they differ", () => {
  const a = { name: "claude", status: "idle", cwd: "/x/Loftware-Automation-Proxy", paneId: "w5:p1", workspaceId: "w5", focused: false } as const;
  const b = { name: "claude", status: "idle", cwd: "/y/Loftware-Automation-Proxy", paneId: "w5:p9", workspaceId: "w5", focused: false } as const;
  const la = labelFor(a, [a, b]);
  const lb = labelFor(b, [a, b]);
  expect(la.endsWith("#1")).toBe(true);
  expect(lb.endsWith("#2")).toBe(true);
  expect(la).not.toBe(lb);
  expect(la.length).toBeLessThanOrEqual(24);
});
