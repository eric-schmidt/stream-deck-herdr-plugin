// src/core/agents.test.ts
import { test, expect } from "bun:test";
import {
  normalize,
  labelFor,
  sortForPanel,
  parseDisplayMode,
  type RawAgent,
  type RawWorkspace,
} from "./agents";
import fixture from "../../tests/fixtures/agent-list.json";

const raw = fixture.result.agents as RawAgent[];

// herdr's own order is the deck's order, so normalize must not re-sort. This fixture is a
// real response whose order (w5, wJ, w7, wG) differs from a lexical sort by workspace —
// sorting would put wG before wJ and silently scramble the deck. See ADR 0002.
test("normalize preserves herdr's order and does not sort", () => {
  const agents = normalize(raw);
  expect(agents.map((a) => a.paneId)).toEqual(["w5:p1", "wJ:p1", "w7:p2", "wG:p1"]);
  expect(agents[0]).toEqual({
    name: "claude",
    status: "idle",
    cwd: "/Users/timvdhoorn/Devops/Logidirect/Loftware-Automation-Proxy",
    paneId: "w5:p1",
    workspaceId: "w5",
    focused: false,
    terminalTitle: "",
    stateChangeSeq: 0,
    spaceLabel: "",
  });
});

// Key labels are herdr's space names, which the user renames for exactly this purpose.
// `herdr agent list` does not carry them, so they are joined in from `herdr workspace list`.
const SPACES: RawWorkspace[] = [
  { workspace_id: "w5", label: "Loftware Proxy" },
  { workspace_id: "w7", label: "LMMS" },
];

test("normalize joins space names in by workspace id", () => {
  const agents = normalize(raw, SPACES);
  expect(agents.find((a) => a.paneId === "w5:p1")!.spaceLabel).toBe("Loftware Proxy");
  expect(agents.find((a) => a.paneId === "w7:p2")!.spaceLabel).toBe("LMMS");
  // No matching workspace: empty, so labelFor falls back rather than showing nothing.
  expect(agents.find((a) => a.paneId === "wJ:p1")!.spaceLabel).toBe("");
});

test("labelFor prefers the space name over the directory", () => {
  const agents = normalize(raw, SPACES);
  const a = agents.find((x) => x.paneId === "w5:p1")!;
  expect(labelFor(a, agents)).toBe("Loftware Proxy"); // cwd basename is Loftware-Automation-Proxy
});

test("labelFor falls back to cwd, then agent name, when no space name is known", () => {
  const [withCwd] = normalize([
    { agent: "claude", agent_status: "idle", cwd: "/x/myproj", pane_id: "p1", workspace_id: "w1" },
  ] as RawAgent[]);
  expect(labelFor(withCwd, [withCwd])).toBe("myproj");

  const [noCwd] = normalize([
    { agent: "codex", agent_status: "idle", cwd: "", pane_id: "p2", workspace_id: "w1" },
  ] as RawAgent[]);
  expect(labelFor(noCwd, [noCwd])).toBe("codex");
});

// herdr allows two spaces to share a name, and auto-naming from the directory makes it
// likely — this is live in the maintainer's session (two spaces named content-model-reviews).
test("two spaces sharing a name disambiguate to #1 / #2", () => {
  const agents = normalize(
    [
      { agent: "claude", agent_status: "idle", cwd: "/a/reviews", pane_id: "wY:p1", workspace_id: "wY" },
      { agent: "claude", agent_status: "idle", cwd: "/b/reviews", pane_id: "w12:p2", workspace_id: "w12" },
    ] as RawAgent[],
    [
      { workspace_id: "wY", label: "content-model-reviews" },
      { workspace_id: "w12", label: "content-model-reviews" },
    ],
  );
  // Numbered by paneId, not by position on the deck, so a key keeps its number as agents
  // come and go: w12:p2 sorts before wY:p1 even though wY is listed first.
  const labels = agents.map((a) => labelFor(a, agents));
  expect(labels).toEqual(["content-model-reviews #2", "content-model-reviews #1"]);
  expect(new Set(labels).size).toBe(2);
  expect(labels.every((l) => l.length <= 24)).toBe(true);
});

test("parseDisplayMode maps the legacy \"project\" value to space", () => {
  expect(parseDisplayMode("project")).toBe("space");
  expect(parseDisplayMode(undefined)).toBe("space");
  expect(parseDisplayMode("nonsense")).toBe("space");
  expect(parseDisplayMode("title")).toBe("title");
});

// herdr's agent panel can be ordered two ways (`[ui] agent_panel_sort`), and the deck
// mirrors whichever is set. The fixture holds one agent of each status, in herdr's list
// order: idle, working, blocked, done.
test("sortForPanel leaves spaces order untouched", () => {
  const agents = normalize(raw);
  expect(sortForPanel(agents, "spaces")).toBe(agents); // same array, not a copy
  expect(sortForPanel(agents, "spaces").map((a) => a.paneId)).toEqual([
    "w5:p1",
    "wJ:p1",
    "w7:p2",
    "wG:p1",
  ]);
});

test("sortForPanel priority is an attention queue: blocked, done, working, idle", () => {
  const agents = normalize(raw);
  expect(sortForPanel(agents, "priority").map((a) => a.paneId)).toEqual([
    "w7:p2", // blocked
    "wG:p1", // done
    "wJ:p1", // working
    "w5:p1", // idle
  ]);
});

test("sortForPanel priority breaks ties on most-recently-changed", () => {
  const agents = normalize([
    { agent: "a", agent_status: "idle", cwd: "/a", pane_id: "p1", workspace_id: "w1", state_change_seq: 10 },
    { agent: "b", agent_status: "idle", cwd: "/b", pane_id: "p2", workspace_id: "w1", state_change_seq: 99 },
    { agent: "c", agent_status: "blocked", cwd: "/c", pane_id: "p3", workspace_id: "w1", state_change_seq: 1 },
  ] as RawAgent[]);
  // blocked wins on attention despite the lowest seq; the two idle agents order by recency.
  expect(sortForPanel(agents, "priority").map((a) => a.paneId)).toEqual(["p3", "p2", "p1"]);
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
  expect(labelFor(lmms, agents)).toBe("LMManagementSystem"); // full basename (<= 24 chars)
  const dupA = { name: "c", status: "idle", cwd: "/x/app", paneId: "w1:p1", workspaceId: "w1", focused: false, terminalTitle: "" } as const;
  const dupB = { name: "c", status: "idle", cwd: "/y/app", paneId: "w2:p3", workspaceId: "w2", focused: false, terminalTitle: "" } as const;
  expect(labelFor(dupA, [dupA, dupB])).toBe("app #1");
});

test("labelFor numbers long duplicate names so they differ", () => {
  const a = { name: "claude", status: "idle", cwd: "/x/Loftware-Automation-Proxy", paneId: "w5:p1", workspaceId: "w5", focused: false, terminalTitle: "" } as const;
  const b = { name: "claude", status: "idle", cwd: "/y/Loftware-Automation-Proxy", paneId: "w5:p9", workspaceId: "w5", focused: false, terminalTitle: "" } as const;
  const la = labelFor(a, [a, b]);
  const lb = labelFor(b, [a, b]);
  expect(la.endsWith("#1")).toBe(true);
  expect(lb.endsWith("#2")).toBe(true);
  expect(la).not.toBe(lb);
  expect(la.length).toBeLessThanOrEqual(24);
});

test("normalize maps terminal_title_stripped to terminalTitle, empty when missing", () => {
  const agents = normalize([
    { agent: "x", agent_status: "working", cwd: "/a/b", pane_id: "w1:p1", workspace_id: "w1", terminal_title_stripped: "Fix login bug" },
    { agent: "y", agent_status: "working", cwd: "/c/d", pane_id: "w1:p2", workspace_id: "w1" },
  ] as RawAgent[]);
  expect(agents.find((a) => a.paneId === "w1:p1")!.terminalTitle).toBe("Fix login bug");
  expect(agents.find((a) => a.paneId === "w1:p2")!.terminalTitle).toBe("");
});

test("labelFor title mode shows the terminal title", () => {
  const a = { name: "claude", status: "working", cwd: "/x/proj", paneId: "w1:p1", workspaceId: "w1", focused: false, terminalTitle: "Fix login bug" } as const;
  expect(labelFor(a, [a], "title")).toBe("Fix login bug");
});

test("labelFor title mode truncates long titles with an ellipsis", () => {
  const longTitle = "This is an extremely long terminal title that overflows";
  const a = { name: "claude", status: "working", cwd: "/x/proj", paneId: "w1:p1", workspaceId: "w1", focused: false, terminalTitle: longTitle } as const;
  const label = labelFor(a, [a], "title");
  expect(label.length).toBeLessThanOrEqual(24);
  expect(label.endsWith("…")).toBe(true);
});

test("labelFor title mode falls back to project name when terminalTitle is empty", () => {
  const a = { name: "claude", status: "working", cwd: "/x/myproj", paneId: "w1:p1", workspaceId: "w1", focused: false, terminalTitle: "" } as const;
  expect(labelFor(a, [a], "title")).toBe("myproj");
});
