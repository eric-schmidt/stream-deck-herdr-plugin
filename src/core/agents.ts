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
};

export type Agent = {
  name: string;
  status: AgentStatus;
  cwd: string;
  paneId: string;
  workspaceId: string;
  focused: boolean;
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
  };
}

export function normalize(raw: RawAgent[]): Agent[] {
  return raw
    .map(toAgent)
    .filter((a): a is Agent => a !== null)
    .slice()
    .sort(
      (a, b) =>
        a.workspaceId.localeCompare(b.workspaceId) || a.paneId.localeCompare(b.paneId),
    );
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function shortPane(paneId: string): string {
  const parts = paneId.split(":");
  return parts[parts.length - 1] ?? paneId;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function labelFor(agent: Agent, peers: Agent[], max = 24): string {
  const base = basename(agent.cwd) || agent.name;
  const duplicate = peers.some(
    (p) => p.paneId !== agent.paneId && (basename(p.cwd) || p.name) === base,
  );
  const text = duplicate ? `${base}·${shortPane(agent.paneId)}` : base;
  return truncate(text, max);
}
