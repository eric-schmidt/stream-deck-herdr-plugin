// src/core/agents.test.ts
import { test, expect } from "bun:test";
import { normalize, labelFor, type RawAgent } from "./agents";
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

test("labelFor uses cwd basename, truncates, disambiguates duplicates", () => {
  const agents = normalize(raw);
  const lmms = agents.find((a) => a.paneId === "w7:p2")!;
  expect(labelFor(lmms, agents)).toBe("LMManage…"); // basename truncated to 9
  const dupA = { name: "c", status: "idle", cwd: "/x/app", paneId: "w1:p1", workspaceId: "w1", focused: false } as const;
  const dupB = { name: "c", status: "idle", cwd: "/y/app", paneId: "w2:p3", workspaceId: "w2", focused: false } as const;
  expect(labelFor(dupA, [dupA, dupB])).toBe("app·p1");
});
