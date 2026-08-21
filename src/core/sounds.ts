// src/core/sounds.ts
//
// Which sound the deck makes when an agent flips to `blocked` or `done`.
//
// The deck owns this audio outright. It never asks herdr for a notification sound — every
// `notification show` goes out with `--sound none` — because herdr already chimes on its own
// whenever an agent changes state in a background workspace (`[ui.sound] enabled`). Asking for
// a notification sound on top of that is a *second* herdr sound, which is what the plugin used
// to do and why `done` played twice. See ADR 0003.
//
// herdr's chime cannot be suppressed from here; it is turned off in herdr's own config, which
// the property inspector offers to do once the clash is detected.
//
// Only `blocked` and `done` are configurable, because they are the only statuses that reach the
// notify path at all: `detectFlips` (./transitions.ts) filters on `isAttention`.
import type { AgentStatus } from "./status";

// The sounds macOS ships. Kept here as the single source of truth for validation; the property
// inspector lists the same names, and a test asserts the two have not drifted.
//
// Both this and `SYSTEM_SOUND_DIR` are the platform-specific half of this feature — a Windows
// port would swap the catalog and the play command in `src/os/sound.ts` and nothing else.
export const SYSTEM_SOUNDS = [
  "Basso", "Blow", "Bottle", "Frog", "Funk", "Glass", "Hero",
  "Morse", "Ping", "Pop", "Purr", "Sosumi", "Submarine", "Tink",
] as const;

export const SYSTEM_SOUND_DIR = "/System/Library/Sounds";

export type SoundChoice =
  | { kind: "none" } // the deck stays quiet; herdr's own chime, if enabled, is unaffected
  | { kind: "system"; name: string }
  | { kind: "file"; path: string };

export type SoundConfig = { blocked: SoundChoice; done: SoundChoice };

// Silent by default, deliberately. A fresh install then makes exactly one sound per flip —
// herdr's own chime — instead of the two it made before this existed. Nothing doubles until
// the user opts in, and the inspector explains the clash at the moment they do.
export const DEFAULT_SOUND_CONFIG: SoundConfig = {
  blocked: { kind: "none" },
  done: { kind: "none" },
};

const KNOWN_SYSTEM: ReadonlySet<string> = new Set(SYSTEM_SOUNDS);

// A custom path must be absolute, and must not look like a flag: the value is stored settings
// and reaches `afplay` as an argument, so `-x` would be read as an option rather than a file.
// `src/os/sound.ts` refuses the same shapes independently — this is the parse-time gate, that
// is the call-time one.
export function isPlayablePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("-");
}

// Tolerant on purpose: these are stored settings, and an unrecognised or half-finished value
// (an "Other…" selection with no file chosen yet) falls back to silence rather than to some
// arbitrary sound. Same posture as `parseDisplayMode` and `parseTerminalTab`.
export function parseSoundChoice(value: unknown, file: unknown): SoundChoice {
  if (value === "other") {
    const path = typeof file === "string" ? file.trim() : "";
    return path !== "" && isPlayablePath(path) ? { kind: "file", path } : { kind: "none" };
  }
  if (typeof value === "string" && value.startsWith("system:")) {
    const name = value.slice("system:".length);
    if (KNOWN_SYSTEM.has(name)) return { kind: "system", name };
  }
  return { kind: "none" };
}

// Reads the plugin's global settings object. Global rather than per-key because notifications
// fire from the store subscription, and keys are positional — a per-key sound would follow the
// deck position rather than the agent. See ADR 0003.
export function parseSoundConfig(settings: unknown): SoundConfig {
  const s = (settings ?? {}) as Record<string, unknown>;
  return {
    blocked: parseSoundChoice(s.soundBlocked, s.soundBlockedFile),
    done: parseSoundChoice(s.soundDone, s.soundDoneFile),
  };
}

// The absolute path to play for this flip, or null when the deck stays quiet.
export function soundPathFor(status: AgentStatus, config: SoundConfig): string | null {
  const choice = status === "blocked" ? config.blocked : config.done;
  switch (choice.kind) {
    case "system":
      return `${SYSTEM_SOUND_DIR}/${choice.name}.aiff`;
    case "file":
      return choice.path;
    default:
      return null;
  }
}

// Whether the user has asked the deck for any sound at all. Half of the clash test: it only
// matters that herdr is also chiming if the deck is chiming too.
export function hasDeckSound(config: SoundConfig): boolean {
  return config.blocked.kind !== "none" || config.done.kind !== "none";
}
