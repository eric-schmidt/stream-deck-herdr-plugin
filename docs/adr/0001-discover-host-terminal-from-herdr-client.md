# ADR 0001 — Discover the host terminal from the herdr client process

- **Status:** Accepted — revisit when Warp's local control API ships publicly
- **Date:** 2026-08-17
- **Affects:** `src/os/hostterminal.ts`, `src/os/terminal.ts`, `HERDR_DECK_TERMINAL_APP`,
  `HERDR_DECK_TERMINAL_TAB`

## Context

Focusing a herdr pane only switches the pane *inside* herdr. For "press = focus" to
actually work, a key press must also put the host terminal on screen — and land on the
tab herdr occupies, since herdr is typically one tab among many.

The original implementation raised an app by name from `HERDR_DECK_TERMINAL_APP`
(defaulting to `iTerm`) via `tell application "<app>" to activate`. Two problems:

1. **It failed silently.** `src/actions/slot.ts` and `src/actions/pager.ts` catch and log
   a failed raise so it cannot mask a successful pane switch. If the configured app was
   wrong — or not installed — a press switched the pane and left it off screen with no
   visible symptom.
2. **It could not address a tab.** An app name cannot identify a tab, so herdr sitting in
   a background tab still had to be found by hand.

Two constraints shaped the options:

- The plugin runs as a child of Elgato Stream Deck.app. macOS TCC prompts (Automation,
  Accessibility) are attributed to Stream Deck and a background process cannot count on
  the user ever seeing or granting them.
- Warp ships **no AppleScript dictionary**, so its tabs are not scriptable. Its documented
  `warp://` routes only *create* things (`action/new_tab`, `launch/…`, `tab_config/…`) or
  open Settings — none focus an existing session.

## Decision

Derive the host terminal from the **attached herdr client process** instead of from
configuration. The client is the process the user typed `herdr` into, so the terminal
session it was launched from *is* where herdr is on screen.

`src/os/hostterminal.ts` lists candidates with `ps -Ao pid=,tty=,comm=`, keeps those whose
`comm` basename is `herdr` **and** which have a controlling terminal, then reads each one's
environment with `ps eww`. The tty requirement is what distinguishes the client the user is
looking at from the `herdr server` daemon and from the plugin's own short-lived
`herdr agent list` calls, neither of which has a tty.

`src/os/terminal.ts` then walks a chain, first success winning:

| Step | Source | Action |
|------|--------|--------|
| 1 | `HERDR_DECK_TERMINAL_APP`, if set | `open -a <app>` |
| 2 | client's `WARP_FOCUS_URL` | `open <url>` — raises Warp **and** selects herdr's exact tab |
| 3 | client's `__CFBundleIdentifier` | `open -b <bundle id>` |
| 4 | fallback | `open -a Warp` |

Everything routes through `open` (LaunchServices), which requires no TCC grant of any
kind. `osascript` survives only in the opt-in `HERDR_DECK_TERMINAL_TAB` keystroke fallback.

### The load-bearing detail

`ps` reports the environment a process was **exec'd with**, not its current environment.
Variables a shell exports after exec are invisible. This is why the design reads the
`herdr` *client* — exec'd from a shell that had already exported `WARP_FOCUS_URL`, so it
carries the value — while Warp's own tab shells (`-zsh -g --no_rcs`) show an empty
environment, because Warp injects `WARP_*` after exec.

## Options considered

**A. Keep a configured app name + AppleScript `activate`.** Rejected: cannot address a tab
at all, needs an Automation grant, and the configuration goes stale invisibly. Observed
concretely: `HERDR_DECK_TERMINAL_APP=Terminal` had been set in the launchd session env
(`launchctl setenv`, in no rc file and no LaunchAgent), which silently overrode the code
default — a class of bug with no feedback loop.

**B. Configured app + synthetic Cmd-N via System Events.** Implemented first, then
rejected as the default:

- *Positional, not identity-based.* Cmd-1 selects tab 1 of the most recently used window,
  which is only herdr's tab by coincidence — and stops being true when tabs are reordered
  or a second window is open.
- *Requires Accessibility permission* for Elgato Stream Deck. Verified failing in practice
  with `System Events got an error: osascript is not allowed to send keystrokes. (1002)`.
- *Depends on a user-rebindable keybinding.* Warp's `workspace:activate_first_tab` is bound
  to `cmdorctrl-1` by default, but `~/.warp/keybindings.yaml` can change it.
- *Racy.* `activate`/`open` return before the app is frontmost and keystrokes go to
  whatever *is* frontmost, so it needs a polling guard to avoid typing into the app being
  switched away from.

Retained as an opt-in fallback (`HERDR_DECK_TERMINAL_TAB`) for terminals that expose no
focus URL, and as a recovery path if step 2 ever regresses.

**C. Record `WARP_FOCUS_URL` from a shell rc hook.** Rejected: requires setup outside this
repo, and the naive version is wrong. Panes inherit the herdr **server's** environment, so
a hook running in every shell would record where the server was *first started*, not where
herdr is displayed now. Observed directly: the attached client was running under Apple
Terminal while the server still carried `TERM_PROGRAM=WarpTerminal` and a `WARP_FOCUS_URL`
from a Warp tab that had since closed.

**D. Warp's local control API.** The Warp binary contains a full control surface —
`app.activate`, `window.focus`, `tab.activate`, `pane.focus`, addressed by
`instance_id`/`window_id`/`tab_id`/`pane_id`, reachable as `warp control …`. This is the
correct long-term answer, but it is gated behind a `local_control` setting with a client
allowlist (`local_control_disabled`, `unauthorized_local_client`, `not_allowlisted`),
absent from the public docs, and the CLI mode selector could not be triggered. Not usable
today.

## Consequences

**Good**

- No configuration in the common case, and no macOS permission prompts on the happy path.
- The tab is addressed **by identity**, so it survives tab reordering, multiple windows and
  rebound shortcuts.
- Self-correcting: nothing is cached, so relaunching or reattaching herdr in a different
  terminal takes effect on the next key press.
- Both env vars remain as escape hatches, and a discovery miss is surfaced through
  `onWarn` → `streamDeck.logger` rather than degrading silently.

**Bad, and accepted**

- Parsing `ps` output is brittle by nature. Mitigated by targeted regexes for
  `WARP_FOCUS_URL` and `__CFBundleIdentifier` rather than a general `KEY=VALUE` parse
  (`ps` is whitespace-delimited, so values containing spaces are ambiguous; a URL and a
  bundle id never are), and by validating the URL against Warp's own scheme so a stray
  environment value cannot reach `open` as a path or a flag.
- `WARP_FOCUS_URL` is real but undocumented; Warp could change or drop it. Step 3 degrades
  to raising the right app, step 4 to raising Warp.
- Reading another process's environment is same-uid-only and could be restricted by a
  future macOS release. The chain then degrades to step 4 rather than failing.
- Two `ps` spawns per key press. Negligible at human rates, and the reason no cache is
  needed.
- Requires an attached client. A headless herdr, or one attached over ssh, falls back to
  step 4.

## Revisit when

Warp's `local_control` API becomes generally available. It addresses tabs and panes
directly, needs no environment archaeology and no undocumented URL, and would replace
`src/os/hostterminal.ts` outright.

## References

- `src/os/hostterminal.ts` — discovery; `src/os/terminal.ts` — the resolution chain
- Behaviour and overrides: **Configuration** in `README.md`
- Verified: `workspace:activate_first_tab` → "Switch to 1st tab" → `cmdorctrl-1`, and
  `://session/` built from `WARP_TERMINAL_SESSION_UUID` and exported as `WARP_FOCUS_URL`,
  both found in `/Applications/Warp.app/Contents/MacOS/stable`
- Warp URI scheme docs (no focus route):
  <https://docs.warp.dev/terminal/more-features/uri-scheme/>
