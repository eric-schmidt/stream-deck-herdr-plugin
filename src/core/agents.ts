// src/core/agents.ts
import type { AgentStatus } from "./status";

export type RawAgent = {
  agent?: string;
  agent_status?: string;
  cwd?: string;
  focused?: boolean;
  pane_id?: string;
  workspace_id?: string;
  tab_id?: string;
  terminal_title_stripped?: string;
  state_change_seq?: number;
};

export type Agent = {
  name: string;
  status: AgentStatus;
  cwd: string;
  paneId: string;
  workspaceId: string;
  focused: boolean;
  terminalTitle: string;
  // herdr's monotonic counter for the last state change; the tiebreak in "priority" order.
  stateChangeSeq: number;
};

const KNOWN: ReadonlySet<string> = new Set(["idle", "working", "blocked", "done", "unknown"]);

function toAgent(r: RawAgent): Agent | null {
  if (!r || typeof r.pane_id !== "string") return null;
  const status: AgentStatus =
    typeof r.agent_status === "string" && KNOWN.has(r.agent_status)
      ? (r.agent_status as AgentStatus)
      : "unknown";
  return {
    name: typeof r.agent === "string" ? r.agent : "agent",
    status,
    cwd: typeof r.cwd === "string" ? r.cwd : "",
    paneId: r.pane_id,
    workspaceId: typeof r.workspace_id === "string" ? r.workspace_id : "",
    focused: r.focused === true,
    terminalTitle: typeof r.terminal_title_stripped === "string" ? r.terminal_title_stripped : "",
    stateChangeSeq: typeof r.state_change_seq === "number" ? r.state_change_seq : 0,
  };
}

// Order is herdr's, deliberately: `herdr agent list` returns agents in the order herdr's
// agent panel shows them under its default "spaces" sort, so the deck mirrors the terminal
// and key N is herdr row N. Do NOT sort here. Sorting lexically by workspaceId — which this
// used to do — scrambles it, because ids run w0…w9, wA…wZ, w10, w11…: with 12 workspaces
// the deck showed herdr row 11 on its first key. See ADR 0002.
export function normalize(raw: RawAgent[]): Agent[] {
  return raw.map(toAgent).filter((a): a is Agent => a !== null);
}

// herdr's `[ui] agent_panel_sort`. "workspaces" is herdr's own accepted alias for "spaces".
export type AgentPanelSort = "spaces" | "priority";

// How much an agent wants you: herdr's builtin `attention` sort field, which its "priority"
// mode (an "attention queue", per herdr's own config comment) orders by.
const ATTENTION: Record<string, number> = {
  blocked: 3,
  done: 2,
  working: 1,
  idle: 0,
  unknown: 0,
};

// Reproduce herdr's agent-panel ordering so the deck matches what the panel shows.
//
// "spaces" is herdr's list order, already correct — return it untouched.
// "priority" is attention first, then most-recently-changed. `agent.list` takes EmptyParams
// (no sort), and `agent.view.set` would mutate the user's own panel, so herdr cannot sort
// this for us and it has to be reproduced here. Confirmed against a live panel; the
// comparator is undocumented, so treat a mismatch as a herdr change rather than a bug here.
export function sortForPanel(agents: Agent[], sort: AgentPanelSort): Agent[] {
  if (sort === "spaces") return agents;
  return agents
    .slice()
    .sort(
      (a, b) =>
        (ATTENTION[b.status] ?? 0) - (ATTENTION[a.status] ?? 0) ||
        b.stateChangeSeq - a.stateChangeSeq,
    );
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export type DisplayMode = "project" | "title";

export function labelFor(
  agent: Agent,
  peers: Agent[],
  display: DisplayMode = "project",
  max = 24,
): string {
  if (display === "title") {
    const title = agent.terminalTitle.trim();
    if (title) return truncate(title, max);
    // No title available — fall through to the project-name label.
  }
  const base = basename(agent.cwd) || agent.name;
  // Agents whose project name collides get a stable 1-based number (#1, #2, …),
  // ordered by paneId, so duplicates are told apart at a glance.
  const sameName = peers
    .filter((p) => (basename(p.cwd) || p.name) === base)
    .slice()
    .sort((a, b) => a.paneId.localeCompare(b.paneId));
  if (sameName.length <= 1) return truncate(base, max);
  const number = sameName.findIndex((p) => p.paneId === agent.paneId) + 1;
  const suffix = ` #${number}`;
  // Reserve room so the number always survives truncation.
  return `${truncate(base, Math.max(1, max - suffix.length))}${suffix}`;
}
