# stream-deck-herdr-plugin

Stream Deck plugin showing live [herdr](https://herdr.dev) agent status: each key is an
agent slot; pressing one focuses that agent's herdr pane and brings the host terminal to
the front. macOS only. TypeScript, bundled with Rollup, tested with `bun test`.

`README.md` is the user-facing tour (install, key layout, configuration). This file is the
contributor/agent orientation: conventions, decisions, and the gotchas that have already
cost someone a debugging cycle.

## Commands

```bash
bun install
bun test                     # unit tests (bun:test)
bunx tsc --noEmit            # type-check
bun run build                # bundle → dev.timvdhoorn.herdr-agents.sdPlugin/bin/plugin.js
bun run watch                # rebuild + restart plugin (needs Stream Deck developer mode)
bunx streamdeck pack dev.timvdhoorn.herdr-agents.sdPlugin --force   # → .streamDeckPlugin
open dev.timvdhoorn.herdr-agents.streamDeckPlugin                   # install it
```

Run `bun test` and `bunx tsc --noEmit` before reporting work done.

## Layout

| Path | Role |
|------|------|
| `src/core/*` | Pure logic — agents, status, pagination, transitions, SVG rendering. No I/O; where the unit tests concentrate. |
| `src/herdr/*` | All herdr CLI/socket I/O (`herdr agent list`, `agent focus`, `notification show`). |
| `src/os/*` | macOS integration: locating and raising the host terminal. |
| `src/actions/*` | Stream Deck action glue (key press, render, long-press pin). Deliberately thin. |
| `src/plugin.ts` | Entry point: reads env, wires dependencies, owns the store subscription. |
| `docs/adr/` | Architecture decision records. |

Key images are SVG data URIs, for crisp text on the 80×80 keys.

## Conventions

- **All I/O goes through an injected `RunFn`** (`(cmd, args) => Promise<string>`), with a
  `defaultRun` using `execFile`. Tests pass a recording `run` and assert the exact argv.
  Add new I/O this way rather than importing `child_process` at a call site.
- **Parsing is a separate, exported, pure function** from the code that spawns the process
  (e.g. `parseHerdrClientPids`, `parseProcessEnv`, `parseTerminalTab`). Test the parser on
  recorded real output; keep the I/O wrapper thin.
- **Absolute paths for system binaries** — `/usr/bin/open`, `/bin/ps`, `/usr/bin/osascript`.
  Stream Deck launches plugins with a minimal `PATH`; `src/herdr/client.ts` additionally
  prepends Homebrew paths so `herdr` resolves.
- **No logger inside `src/core/*` or `src/os/*`.** They take callbacks (`onWarn`) and
  `src/plugin.ts` wires them to `streamDeck.logger`. Only `src/actions/*` and `plugin.ts`
  import `@elgato/streamdeck`.
- Comments explain *why*, especially where a simpler-looking approach was tried and failed.

## Decisions

- **The host terminal is discovered, not configured.** `src/os/hostterminal.ts` reads the
  environment of the attached `herdr` client process to learn which terminal — and which
  tab — herdr is displayed in. Full reasoning, rejected alternatives, and the revisit
  trigger: [ADR 0001](docs/adr/0001-discover-host-terminal-from-herdr-client.md). **Read it
  before "simplifying" that module**; the obvious rewrites (AppleScript `activate`, a
  synthetic Cmd-1, reading a herdr pane's env) have each been tried and each fails.
- **`HERDR_DECK_TERMINAL_APP` / `HERDR_DECK_TERMINAL_TAB` are overrides, not setup.** The
  common case needs no configuration. Setting the app var *skips discovery* and so gives up
  exact-tab focus; the tab var is off by default because synthesizing Cmd-N requires an
  Accessibility grant the happy path must not depend on.
- **`open` (LaunchServices) over `osascript`** for raising apps: it needs no TCC grant,
  whereas AppleScript `activate` needs Automation permission that a background plugin
  cannot reliably obtain. `osascript` survives only in the opt-in keystroke fallback.
- **`TerminalActivator`'s shape is load-bearing.** `slot.ts` and `pager.ts` call
  `activate()` and log-but-ignore failures so a raise failure never masks a successful pane
  focus. Keep that signature when changing `src/os/terminal.ts`.

## Gotchas

These are all things that have already burned a session.

- **The plugin inherits Elgato Stream Deck.app's environment.** `launchctl setenv/unsetenv`,
  shell exports, and even reinstalling the plugin will *not* change `HERDR_DECK_*` for a
  running install — the stale value comes from the parent. Quit and relaunch **Stream
  Deck.app itself**, then verify:
  ```bash
  ps eww -o command= -p $(pgrep -f "herdr-agents.sdPlugin/bin/plugin.js" | head -1) \
    | tr ' ' '\n' | grep -E "^HERDR_DECK"
  ```
- **`ps` reports the environment a process was *exec'd* with**, not its current one. This is
  why discovery reads the `herdr` client (exec'd from a shell that had already exported
  `WARP_FOCUS_URL`) and why Warp's own tab shells look empty — Warp exports `WARP_*` after
  exec.
- **`open` exits 0 even when the target app ignores the URL.** Success of
  `open warp://session/<uuid>` cannot be established from an exit status; only by watching
  the screen. Don't write code that treats exit 0 as confirmation.
- **`streamdeck pack` rewrites `manifest.json`**, stripping its trailing newline. Check
  `git status` after packing so it doesn't ride along in an unrelated commit.
- **Developer mode is off on the maintainer's machine**, so `bunx streamdeck restart <uuid>`
  is refused (`Feature only enabled in developer mode`) and `bun run watch` won't work. The
  installed plugin is a *copy*, not a symlink to this repo, so `bun run build` alone changes
  nothing that's running — pack and reinstall.
- **Plugin logs** land in
  `~/Library/Application Support/com.elgato.StreamDeck/Plugins/dev.timvdhoorn.herdr-agents.sdPlugin/logs/*.log`
  (numbered, rotated). The directory is created lazily, so "empty" can just mean "nothing
  logged yet".

## Where to look for X

- *Why does focusing use `ps` and `open` instead of AppleScript?* →
  `docs/adr/0001-discover-host-terminal-from-herdr-client.md`, and the header comment of
  `src/os/hostterminal.ts`.
- *How is the host terminal resolved, in order?* → the `createTerminalActivator` comment in
  `src/os/terminal.ts`.
- *What do the env vars do?* → **Configuration** in `README.md`.
- *How does an agent's status become a key image?* → `src/core/status.ts`,
  `src/core/render.ts`, `src/core/agent-icons.ts`.
- *When does a key flash or notify?* → `detectFlips` in `src/core/transitions.ts`, consumed
  by the store subscription in `src/plugin.ts`.

## Note on agent memory

Claude Code's project memory (`~/.claude/projects/<slug>/memory/`) is local to one machine
and account, and its directory name derives from the absolute repo path — so it does **not**
travel with a clone. This file is the portable source of truth; treat memory as a local
cache and re-seed it from here if useful.

## Current state

*Ephemeral — safe to delete, and should be dropped from any branch proposed upstream.*

- The host-terminal rework — discovery, the `open`-based chain, override logging, and
  ADR 0001 — is merged to `master` (was PR #1 on the fork).
- Verified on a real device: a key press raises Warp *and* lands on herdr's tab; discovery
  succeeds on every press; `ps eww` works from inside Stream Deck's process tree.
- Known-unsupported dependency: `WARP_FOCUS_URL` and the `warp://session/<uuid>` route are
  real but undocumented. Steps 3–4 of the chain cover a regression.
- Not upstreamed to `timvdhoorn/stream-deck-herdr-plugin` yet; that is under consideration,
  which is why ADR 0001 is written to persuade a maintainer.
