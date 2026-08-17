# herdr agents — Stream Deck plugin

Live [herdr](https://herdr.dev) agent status on your Elgato Stream Deck.

See which of your AI coding agents are running, busy, blocked, or finished — at a
glance, on physical keys. Press a key to jump straight to that agent's pane and
bring your terminal to the foreground. No more hunting through tabs to find the
agent that's waiting on you.

![herdr agents running on a Stream Deck Mini](docs/deck.png)

## What it does

- **One key per agent.** Each key mirrors a live herdr agent: project label +
  status color + a monochrome logo of the agent type (Claude, Codex, …).
- **Status at a glance** — color and glyph encode `working` / `blocked` / `done`
  / `idle` (see the table below).
- **Press = focus.** A short press runs `herdr agent focus` for that pane *and*
  raises the host terminal app, so the agent is actually on screen even if the
  terminal was in the background.
- **Long-press = pin.** Holding a key pins the agent — it jumps to the front,
  stays visible even when it goes idle, and gets a pushpin badge. Pins are
  in-memory (reset when the plugin restarts).
- **Morphing pager key.** When any agent needs attention it becomes a
  "jump to the next blocked/done agent" key (cycles on repeat presses);
  otherwise it pages through the agent grid. One key, both jobs — fits the 6-key
  Mini.
- **Active notifications.** When an agent flips to `blocked` or `done` you get a
  herdr notification with a sound (`request` / `done`) and the key flashes — even
  when you're not looking at the deck.
- **Idle agents are hidden** so the deck only shows agents that matter.
- **Instant updates.** Refreshes on herdr socket events (push), with a slow
  safety-net poll as a backstop — no busy 1-second polling.

## Status → key

| status   | color      | glyph | meaning           |
|----------|------------|-------|-------------------|
| working  | orange     | ●     | running now        |
| blocked  | red        | ▲     | wants you          |
| done      | green      | ✓     | finished, unseen   |
| idle     | grey       | ○     | waiting (hidden)   |
| unknown  | near-black | ·     | —                  |
| empty    | black      |       | no agent in slot   |

## Tested on

- **Stream Deck Mini** (6 keys)
- macOS 26 (Apple Silicon)
- Elgato Stream Deck app **7.4.2**
- **herdr 0.7.0**

The plugin is keypad-only and works on any Stream Deck model with keys. The
default layout assumes the 6-key Mini, but you can place the two actions on a
deck of any size.

## Requirements

- macOS 12 or newer
- [Elgato Stream Deck](https://www.elgato.com/stream-deck) app 7.1+
- [herdr](https://herdr.dev) 0.7.0+ installed and running (`herdr` on your `PATH`)
- To build from source: [Bun](https://bun.sh) and Node.js 24

## Install

### From source

```bash
git clone https://github.com/timvdhoorn/stream-deck-herdr-plugin.git
cd stream-deck-herdr-plugin
bun install
bun run build

# enable Stream Deck developer mode (one-time), then link + start the plugin
bunx streamdeck dev
bunx streamdeck link dev.timvdhoorn.herdr-agents.sdPlugin
bunx streamdeck restart dev.timvdhoorn.herdr-agents
```

### As a packaged plugin

Produce a double-clickable `.streamDeckPlugin` installer:

```bash
bun run build
bunx streamdeck pack dev.timvdhoorn.herdr-agents.sdPlugin
```

This writes `dev.timvdhoorn.herdr-agents.streamDeckPlugin` — double-click it to
install into the Stream Deck app.

## Layout & usage

In the Stream Deck app, drag the two actions from the **herdr** category onto
your keys. The recommended 6-key Mini layout:

```
[ Agent Slot 0 ][ Agent Slot 1 ][ Agent Slot 2 ]
[ Agent Slot 3 ][ Agent Slot 4 ][    Pager      ]
```

- **Agent Slot** — set its `slotIndex` (0–4) in the Property Inspector. Each slot
  shows one agent.
  - *Short press* → focus that agent's pane + raise the terminal on herdr's tab.
  - *Long press* → pin/unpin the agent.
- **Pager** — jumps to the next agent needing attention, or pages the grid when
  none do.

Prefer a flat, no-paging layout? Place six **Agent Slot** keys (`slotIndex` 0–5)
and skip the pager.

## Configuration

None required. The plugin works out which terminal herdr is displayed in — and
which tab of it — by inspecting the attached `herdr` client process, so it follows
you when you relaunch or reattach herdr somewhere else. Resolution order:

1. `HERDR_DECK_TERMINAL_APP`, if set → `open -a <app>`.
2. The client's `WARP_FOCUS_URL` → `open <url>`, which raises Warp **and** selects
   herdr's exact tab in one step. No permissions, no keystrokes.
3. The client's `__CFBundleIdentifier` → `open -b <bundle id>`, raising whichever
   terminal herdr was launched from.
4. Otherwise → `open -a Warp`.

Both env vars are escape hatches for when that goes wrong:

| Env var | Default | Purpose |
|---------|---------|---------|
| `HERDR_DECK_TERMINAL_APP` | *(discovered)* | Pin the app to raise, by name — e.g. `Warp`, `Terminal`, `iTerm` (iTerm2), `Ghostty`, `WezTerm`. Note this **skips discovery**, so you lose exact-tab focusing: a bare app name cannot identify a tab. |
| `HERDR_DECK_TERMINAL_TAB` | *(off)* | Select a tab by sending Cmd-*N* after raising the app, for terminals that expose no focus URL. Valid values are `1`–`8`; `0` or `off` leaves the active tab alone. Ignored when step 2 applies. |

`HERDR_DECK_TERMINAL_TAB` is the only path that needs permissions: synthesizing a
keypress requires **Elgato Stream Deck** under System Settings › Privacy &
Security › Accessibility, plus the one-time Automation prompts. Without them the
app is still raised and only the tab switch fails, logged rather than silently
skipped. It is also positional — with several windows open, Cmd-*N* hits the most
recently used one.

Caveats worth knowing: `WARP_FOCUS_URL` is a real variable Warp exports but is not
part of its documented URI scheme, so it could change. Warp does have a proper
local control API (`app.activate`, `tab.activate`, `pane.focus`) inside the binary,
but it is disabled and undocumented — when it ships publicly it should replace
this. And because `ps` reports the environment a process was *exec'd* with,
discovery works via the `herdr` client you launched, not via Warp's own tab shells,
which export their `WARP_*` variables after exec.

## How it works

A single store polls/streams `herdr agent list`, normalizes the agents, and
notifies both actions to re-render. All herdr I/O is isolated in
`src/herdr/*` (injected `run` for tests), the pure logic lives in `src/core/*`
(unit-tested with `bun test`), and the Stream Deck actions in `src/actions/*` are
thin glue. Key images are rendered as SVG data URIs for crisp text on the 80×80
keys.

## Development

```bash
bun test                    # run the unit tests
bunx tsc --noEmit           # type-check
bun run build               # bundle to …/bin/plugin.js
bun run watch               # rebuild + restart the plugin on change
```

## License

[MIT](LICENSE) © Tim van der Hoorn
