// src/herdr/config.ts
//
// herdr's agent panel can be ordered two ways, and the deck mirrors whichever is set:
//
//   # Agent panel ordering: "spaces" (grouped by space) or "priority" (attention queue).
//   # "workspaces" is accepted as an alias for "spaces".
//   # agent_panel_sort = "spaces"
//
// `herdr agent list` always returns "spaces" order — its params are EmptyParams, so there is
// no way to ask for the sorted list — and `agent.view.set` would rewrite the user's own
// panel. So the setting is read here and the order reproduced in `sortForPanel`.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentPanelSort } from "../core/agents";

export const HERDR_CONFIG_PATH = join(homedir(), ".config", "herdr", "config.toml");

// Deliberately not a TOML parser: one key is needed, and the embedded default config ships
// the line commented out, so a naive search would read the comment as the value. Matches an
// uncommented `agent_panel_sort = "..."` only.
export function parseAgentPanelSort(toml: string): AgentPanelSort {
  for (const line of toml.split("\n")) {
    const match = /^\s*agent_panel_sort\s*=\s*"([^"]*)"/.exec(line);
    if (match === null) continue;
    const value = match[1].trim().toLowerCase();
    if (value === "priority") return "priority";
    if (value === "spaces" || value === "workspaces") return "spaces";
  }
  return "spaces"; // herdr's own default
}

// Re-read rather than cached: `herdr server reload-config` can change this under us, and the
// file is tiny. Any failure (no config, unreadable) falls back to herdr's default rather than
// surfacing — an unreadable config should not stop the deck from rendering.
export function createHerdrConfig(opts: { path?: string; onWarn?: (m: string) => void } = {}) {
  const path = opts.path ?? HERDR_CONFIG_PATH;
  return {
    async agentPanelSort(): Promise<AgentPanelSort> {
      try {
        return parseAgentPanelSort(await readFile(path, "utf8"));
      } catch (e) {
        opts.onWarn?.(`herdr config unreadable, assuming spaces order: ${String(e)}`);
        return "spaces";
      }
    },
  };
}

export type HerdrConfig = ReturnType<typeof createHerdrConfig>;
