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
import { copyFile, readFile, writeFile } from "node:fs/promises";
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

// herdr plays its own chime whenever an agent changes state in a background workspace, which
// is a different sound source from `notification show --sound` and is not controllable from the
// plugin. The deck reads the setting so it can *tell* the user the two will overlap; turning it
// off is a separate, explicitly-approved action (`setSoundEnabled`). See ADR 0003.
//
// Section-aware, unlike `parseAgentPanelSort`: `enabled` is a common key name and appears under
// other tables too, so a bare line match would read someone else's setting. herdr also ships the
// line commented out, and the default when absent is **true**.
export function parseSoundEnabled(toml: string): boolean {
  let inSection = false;
  for (const line of toml.split("\n")) {
    const header = /^\s*\[([^\]]+)\]/.exec(line);
    if (header !== null) {
      inSection = header[1].trim() === "ui.sound";
      continue;
    }
    if (!inSection) continue;
    const match = /^\s*enabled\s*=\s*(true|false)/.exec(line);
    if (match !== null) return match[1] === "true";
  }
  return true; // herdr's own default
}

// Rewrite `[ui.sound] enabled` in the user's own config.
//
// This is only ever reached from an explicit click in the property inspector, never as a side
// effect of rendering. That distinction is the whole reason it is allowed to exist: ADR 0002
// refused `agent.view.set` because drawing a key would have silently rewritten the user's panel.
// A one-time, labelled, backed-up edit the user asked for is a different act.
//
// Line-level rather than a TOML round-trip on purpose — a real parse-and-serialize would
// reformat and drop the comments in a file the user hand-wrote.
export function withSoundEnabled(toml: string, enabled: boolean): string {
  const value = `enabled = ${enabled}`;
  const lines = toml.split("\n");
  let sectionStart = -1;
  let inSection = false;

  for (let i = 0; i < lines.length; i += 1) {
    const header = /^\s*\[([^\]]+)\]/.exec(lines[i]);
    if (header !== null) {
      if (inSection) break; // left [ui.sound] without finding the key
      inSection = header[1].trim() === "ui.sound";
      if (inSection) sectionStart = i;
      continue;
    }
    // Commented-out too: herdr ships `# enabled = true`, and replacing it in place keeps the
    // setting where the user expects to find it rather than appending a duplicate below.
    if (inSection && /^\s*#?\s*enabled\s*=/.test(lines[i])) {
      lines[i] = value;
      return lines.join("\n");
    }
  }

  if (sectionStart !== -1) {
    lines.splice(sectionStart + 1, 0, value);
    return lines.join("\n");
  }
  const body = toml.endsWith("\n") ? toml : `${toml}\n`;
  return `${body}\n[ui.sound]\n${value}\n`;
}

// Re-read rather than cached: `herdr server reload-config` can change this under us, and the
// file is tiny. Any failure (no config, unreadable) falls back to herdr's default rather than
// surfacing — an unreadable config should not stop the deck from rendering.
export function createHerdrConfig(
  opts: {
    path?: string;
    onWarn?: (m: string) => void;
    // Injected so the write path can ask herdr to reload without importing a client here.
    reload?: () => Promise<void>;
  } = {},
) {
  const path = opts.path ?? HERDR_CONFIG_PATH;
  const read = () => readFile(path, "utf8");
  return {
    async agentPanelSort(): Promise<AgentPanelSort> {
      try {
        return parseAgentPanelSort(await read());
      } catch (e) {
        opts.onWarn?.(`herdr config unreadable, assuming spaces order: ${String(e)}`);
        return "spaces";
      }
    },
    // True when herdr will chime on state changes by itself. Defaults to true — herdr's own
    // default — including when the config cannot be read, so the clash notice errs towards
    // warning rather than towards silence.
    async soundEnabled(): Promise<boolean> {
      try {
        return parseSoundEnabled(await read());
      } catch {
        return true;
      }
    },
    // Explicit, user-clicked, and backed up first — `herdr config reset-keys` sets the
    // precedent of backing this file up before touching it. Returns the backup path so the
    // inspector can say where the old file went.
    async setSoundEnabled(enabled: boolean): Promise<string> {
      const current = await read();
      const backup = `${path}.bak-${Date.now()}`;
      await copyFile(path, backup);
      await writeFile(path, withSoundEnabled(current, enabled), "utf8");
      // Without this the change only lands the next time herdr restarts.
      await opts.reload?.();
      return backup;
    },
  };
}

export type HerdrConfig = ReturnType<typeof createHerdrConfig>;
