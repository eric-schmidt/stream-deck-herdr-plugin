// src/os/terminal.ts
import { execFile } from "node:child_process";
import type { HostTerminalResolver } from "./hostterminal";

export type RunFn = (cmd: string, args: string[]) => Promise<string>;

// Absolute paths so the calls survive Stream Deck's minimal launch PATH (both are fixed
// macOS system binaries).
const OPEN = "/usr/bin/open";
const OSASCRIPT = "/usr/bin/osascript";

// Terminal to raise when herdr's host cannot be resolved. Override with
// HERDR_DECK_TERMINAL_APP (e.g. "Terminal", "iTerm", "Ghostty", "WezTerm").
export const DEFAULT_TERMINAL_APP = "Warp";

// Tab index meaning "don't send a tab-switch keystroke". Tab switching is opt-in: the
// resolved focus URL already lands on herdr's tab, and synthesizing a keypress needs an
// Accessibility grant that the happy path should not depend on.
export const TAB_UNSET = 0;

// Only Cmd-1…Cmd-8 are bound to "switch to Nth tab" in Warp, so refuse anything else.
const MAX_TERMINAL_TAB = 8;

// Parse HERDR_DECK_TERMINAL_TAB. Unset, "off", "0", out of range or unparseable all mean
// "leave the active tab alone". Lenient on purpose: a typo in an env var should not break
// focusing.
export function parseTerminalTab(raw: string | undefined): number {
  if (raw === undefined) return TAB_UNSET;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 1 || n > MAX_TERMINAL_TAB) return TAB_UNSET;
  return n;
}

const defaultRun: RunFn = (cmd, args) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 4000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args.join(" ")} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });

export type TerminalActivator = { activate(): Promise<void> };

// Put the terminal herdr is displayed in on screen. Focusing a herdr pane only switches
// the pane *inside* herdr; this is what raises the GUI app when the terminal was in the
// background. Idempotent, so it can be called on every focus without a separate "is it
// already frontmost?" check.
//
// Resolution order, first success wins:
//   1. an explicit `app` override            → open -a <app>
//   2. the resolved host terminal's focus URL → open <url>   (raises *and* selects
//      herdr's exact tab, so no keystroke is needed)
//   3. the resolved host terminal's bundle id → open -b <id>
//   4. DEFAULT_TERMINAL_APP                   → open -a Warp
//
// Everything goes through `open` (LaunchServices), which needs no TCC grant at all —
// unlike `osascript … activate`, which requires Automation permission for Stream Deck.
// `osascript` is used only for the opt-in tab keystroke below.
export function createTerminalActivator(
  opts: {
    run?: RunFn;
    app?: string;
    tab?: number;
    resolver?: HostTerminalResolver;
  } = {},
): TerminalActivator {
  const run = opts.run ?? defaultRun;
  const app = opts.app;
  const tab = opts.tab ?? TAB_UNSET;
  const resolver = opts.resolver;
  return {
    async activate() {
      // An explicit app override is a deliberate choice to skip discovery — and with it
      // the exact-tab focus, since a bare app name cannot identify a tab.
      const host = app === undefined && resolver ? await resolver.resolve() : null;

      if (host?.focusUrl) {
        await run(OPEN, [host.focusUrl]);
        return; // already on herdr's tab; a keystroke could only move us off it
      }
      // Track what we actually raised, so the frontmost guard below waits on *that* app
      // rather than on whatever the default happens to be.
      let ref: string;
      let target: string;
      if (app !== undefined) {
        await run(OPEN, ["-a", app]);
        [ref, target] = [`application "${app}"`, app];
      } else if (host?.bundleId) {
        await run(OPEN, ["-b", host.bundleId]);
        [ref, target] = [`application id "${host.bundleId}"`, host.bundleId];
      } else {
        await run(OPEN, ["-a", DEFAULT_TERMINAL_APP]);
        [ref, target] = [`application "${DEFAULT_TERMINAL_APP}"`, DEFAULT_TERMINAL_APP];
      }

      if (tab === TAB_UNSET) return;
      // `open` returns before the app is actually frontmost, and keystrokes always go to
      // whatever *is* frontmost — so poll (max ~1s) before typing, or the Cmd-N lands in
      // the app we are switching away from.
      const script = [
        `repeat 20 times`,
        `  if frontmost of ${ref} then exit repeat`,
        `  delay 0.05`,
        `end repeat`,
        `tell application "System Events" to keystroke "${tab}" using command down`,
      ].join("\n");
      try {
        await run(OSASCRIPT, ["-e", script]);
      } catch (e) {
        throw new Error(
          `select tab ${tab} in ${target} failed: ${String(e)} — grant Elgato Stream Deck ` +
            `Accessibility permission (System Settings › Privacy & Security › Accessibility)`,
        );
      }
    },
  };
}
