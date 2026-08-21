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
| `src/herdr/*` | All herdr CLI/socket I/O (`herdr agent list`, `agent focus`, `notification show`) and reading `~/.config/herdr/config.toml`. |
| `src/os/*` | macOS integration: locating and raising the host terminal, and playing notification sounds (`afplay`). |
| `src/actions/*` | Stream Deck action glue (key press, render, deriving slot order from key coordinates). Deliberately thin. |
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
- **The deck mirrors herdr, and nothing about the grid is configured.**
  [ADR 0002](docs/adr/0002-deck-mirrors-herdr-order.md). Three rules follow from it, each of
  which was a bug when violated:
  - **`normalize` must not sort.** `herdr agent list` returns agents in herdr's own display
    order, so deck position N is herdr row N. Sorting lexically by `workspaceId` — which it
    used to do — scrambles it, because ids run `w0…w9`, `wA…wZ`, `w10`…: with 12 workspaces
    the first key showed herdr row 11. Cross-check with `herdr api snapshot` →
    `workspaces[].number`.
  - **herdr's panel has two orders, and the CLI only gives you one.** `[ui] agent_panel_sort`
    is `"spaces"` (default, alias `"workspaces"`) or `"priority"` (an attention queue), but
    `herdr agent list` always returns *spaces* order — `agent.list` takes `EmptyParams`, and
    `agent.view.set` would rewrite the user's own panel. So `sortForPanel` reproduces
    `priority` locally: attention desc, then `state_change_seq` desc. That comparator is
    undocumented and was confirmed against a live panel — if the deck disagrees with herdr,
    suspect a herdr change before assuming a bug here. `src/herdr/config.ts` reads the
    setting; note herdr ships the default config **commented out**, so parse an uncommented
    line only.
  - **Slot index is the key's position**, from `KeyAction.coordinates` via `assignSlots`
    (`src/core/slots.ts`) — reading order, ranked per device. Page size is the **largest
    per-device** key count, not the total: two decks mirror the same agents, so the sum would
    page in strides no single deck can show. There is no `slotIndex` setting, and don't add
    one: a plugin-wide control has nowhere to live, since Stream Deck has **no global
    property inspector** (`GlobalPropertyInspectorPath` is invalid in every schema branch
    and `pack` rejects it).
  - **Idle agents are shown and pinning does not exist.** Both hiding and pinning reorder or
    filter the list, which breaks the mirror.
  - **A key is named by its space, not its directory.** `herdr agent list` does not carry the
    label, so `listWorkspaces` joins it in from `herdr workspace list` on `workspace_id`. The
    fallback chain in `labelFor` is space label → cwd basename → agent name, and the workspace
    fetch is deliberately **non-fatal** in `store.pollNow` — a cosmetic lookup must never
    blank the deck. Two spaces can share a name, so collisions are numbered `#1`/`#2` by
    `paneId` (stable as agents come and go). Labels ellipsize past 24 chars, which is the
    render budget: `wrapLabel(label, 8, 3)`.
- **The deck owns its notification audio; herdr is never asked for a sound.**
  [ADR 0003](docs/adr/0003-per-status-notification-sounds.md). There are two herdr sound
  sources and the plugin used to feed a third: `[ui.sound] enabled` chimes on every state
  change, and `notification show --sound` is a *separate* sound layered on a notification.
  Passing `--sound done` on each flip therefore double-sounded every default install from
  `46fa92b` until ADR 0003. `src/plugin.ts` now passes **`--sound none` unconditionally** —
  don't "restore" it. Five things follow:
  - **The default is silence**, and every unparseable value falls back to it. A fresh install
    makes one sound (herdr's chime), not two, and nothing doubles until the user opts in.
  - **herdr's chime cannot be muted from here.** `parseSoundEnabled` reads it so the inspector
    can *say* both will play; a button then writes `enabled = false` to the user's config and
    runs `herdr server reload-config`. That parse is **section-aware** — `enabled` appears under
    other tables, so a bare line match reads the wrong one.
  - **Writing the user's config is allowed only behind that click.** ADR 0002 refused
    `agent.view.set` because *rendering a key* would rewrite the user's panel. The rule is "no
    mutation as a side effect", not "never write": this one is explicit, labelled, and backed up
    to `config.toml.bak-<epoch>` first. Keep it that way.
  - **The setting is plugin-wide** (`streamDeck.settings.*GlobalSettings`), because the notify
    path iterates flipped *agents*, not keys, and keys are positional. Edited in the Agent Slot
    inspector only because there is no global inspector, hence the "Apply to every key" heading.
  - **`global` in sdpi is a boolean attribute** and the key comes from `setting`, so
    `setting="soundBlocked" global` binds and persists correctly. ADR 0002's claim that the
    binding is broken describes PR #4 writing `global="pageSize"` with no `setting`; ADR 0003
    corrects it. That does not reopen the page-size decision.
  Only `blocked`/`done` are configurable, because `detectFlips` filters on `isAttention`. The
  14 sound names are duplicated between `SYSTEM_SOUNDS` and `ui/slot.html` — the bundled sdpi
  has no `datasource` — and a test reads the HTML to keep them in step.
- **A `null` page size means unpaged, not five.** Nothing is placed, so nothing is paged, and
  `pageCount`/`pageSlice` treat it as one page holding everything. Don't "simplify" it to an
  `Infinity` sentinel: `page * Infinity` is `NaN` and `slice(NaN, NaN)` silently returns
  nothing.

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
- *What sound does a notification make, and why isn't it herdr's?* → `soundPathFor` in
  `src/core/sounds.ts`, `createSoundPlayer` in `src/os/sound.ts`, and
  [ADR 0003](docs/adr/0003-per-status-notification-sounds.md).
- *Why do I hear two sounds?* → herdr's own `[ui.sound] enabled`, which is not ours. The
  inspector detects it (`parseSoundEnabled`) and offers to turn it off (`withSoundEnabled`),
  both in `src/herdr/config.ts`.
- *Which agent does a given key show, and why is there no slot setting?* → `assignSlots` in
  `src/core/slots.ts`, the do-not-sort note on `normalize` in `src/core/agents.ts`, and
  [ADR 0002](docs/adr/0002-deck-mirrors-herdr-order.md).
- *Why is the deck's order different from my herdr panel?* → `[ui] agent_panel_sort` in
  `~/.config/herdr/config.toml`, reproduced by `sortForPanel` in `src/core/agents.ts`.
- *When does the pager jump instead of paging?* → only for **off-page** attention:
  `offPageAttentionAgents` in `src/core/pagination.ts`, consumed by `PagerAction.onKeyDown`.
  Testing *all* agents, as it once did, let one blocked agent disable paging permanently.
- *What is `docs/deck.png`?* → the README's hero image, a photo of the real Stream Deck app.
  It is not generated, so any change to `renderKeySvg`/`renderPagerSvg` dates it and it has to
  be re-shot by hand.

## Note on agent memory

Whatever local memory your agent keeps — Claude Code's memory store, a scratch notes file —
is scoped to one machine and account and does **not** travel with a clone. This file is the
portable source of truth; treat memory as a cache and re-seed it from here if useful.

## Current state

*Ephemeral — safe to delete, and should be dropped from any branch proposed upstream.*

- The host-terminal rework — discovery, the `open`-based chain, override logging, and
  ADR 0001 — is merged to `master` (was PR #1 on the fork).
- The deck-mirrors-herdr work — positional slots, herdr-order mirroring including
  `agent_panel_sort = "priority"`, space-name key labels, the removal of pinning and
  idle-hiding, and ADR 0002 — is merged to `master` (PR #6 on the fork, 2026-08-20).
- **`feat/status-sounds` is the live branch**: per-status notification sounds, the herdr-chime
  clash detector, and ADR 0003. It was written stacked on `feat/deck-mirrors-herdr` before that
  merged; because PR #6 landed as a real merge commit rather than a squash, no restack was
  needed and it targets `master` directly.
- Verified on a real device: a key press raises Warp *and* lands on herdr's tab; discovery
  succeeds on every press; `ps eww` works from inside Stream Deck's process tree.
- Docs were last reconciled with the code on 2026-08-19 against **herdr 0.8.0**, Stream Deck
  app 7.5.1, macOS 26.5.2. herdr 0.8 left everything this plugin depends on unchanged: the
  `idle|working|blocked|done|unknown` vocabulary (`herdr agent wait --until` enumerates it),
  the `agent list` / `workspace list` / `agent focus` / `notification show` shapes, and
  `[ui] agent_panel_sort`.
- **`docs/deck.png` is stale** and known to be: its pager key shows the deleted
  `renderAttentionSvg` (solid red, `⇥`, a count). Needs re-shooting on a real deck.
- **Cross-platform is an open, unstarted scope.** A marketplace release would need Windows
  support, and sound is the smallest part of it: `afplay` and `/System/Library/Sounds` swap out
  behind `SYSTEM_SOUNDS`/`SYSTEM_SOUND_DIR` and the injected `RunFn`, but the whole of
  `src/os/*` (`ps`, `open`, `osascript`, the Warp focus URL) is macOS-only, and
  `manifest.json` declares `"Platform": "mac"`. Don't cite the sound module as evidence the
  port is close.
- Known-unsupported dependency: `WARP_FOCUS_URL` and the `warp://session/<uuid>` route are
  real but undocumented. Steps 3–4 of the chain cover a regression.
- Not upstreamed to `timvdhoorn/stream-deck-herdr-plugin` yet; that is under consideration,
  which is why ADR 0001 is written to persuade a maintainer.
