# ADR 0003 — The deck owns its notification audio

- **Status:** Accepted — revisit if herdr's notification API gains per-call sound selection, or
  when the plugin is ported off macOS
- **Date:** 2026-08-20
- **Affects:** `src/core/sounds.ts`, `src/os/sound.ts`, `src/herdr/config.ts`,
  `src/herdr/client.ts` (`reloadConfig`), `src/plugin.ts`,
  `dev.timvdhoorn.herdr-agents.sdPlugin/ui/slot.html`

## Context

Every notification sounded one of two ways, decided by one hardcoded line in `src/plugin.ts`:

```ts
const sound = a.status === "blocked" ? "request" : "done";
```

The ask was to make that a choice. Doing so surfaced that the line was wrong to begin with.

**There are two independent sound sources, and the plugin was feeding a third.**

1. **herdr's own chime.** `[ui.sound] enabled` — "Play sounds when agents change state in
   background workspaces" — fires whenever an agent changes state. Nothing to do with the deck.
2. **`herdr notification show --sound`.** A *separate* sound, attached to a notification.
3. The plugin was asking for (2) on every flip, on top of (1) already firing.

So a default herdr install has double-sounded since `46fa92b`. It went unnoticed on the
maintainer's machine because their config silences one half of herdr's chime:

```toml
[ui.sound]
enabled = true
# Silence needs-attention (approval) prompts only; "done" chimes still play.
request_path = "sounds/silent.mp3"
```

`blocked` was inaudible; `done` played twice. That asymmetry is what finally exposed it.

**herdr's sound vocabulary cannot express the feature anyway.** `notification show --sound` takes
only `none | done | request`, and `[ui.sound]` has exactly two file slots (`done_path`,
`request_path`), set globally in herdr's own config rather than per notification.

**And the notification is not always visible.** With `[ui.toast] delivery = "off"` — as on the
maintainer's machine — `notification show` renders no popup at all, so that call was contributing
nothing but a redundant noise.

## Decision

**The deck owns its audio. It never asks herdr to make a sound.**

1. **`--sound none`, always.** `src/plugin.ts` passes it unconditionally. Source (3) is gone; the
   plugin no longer stacks a sound on top of herdr's chime.
2. **`herdr notification show` is still called.** The toast is a real notification surface for
   anyone with `[ui.toast]` on. Only the audio is divested.
3. **`/usr/bin/afplay` plays the sound**, behind the usual injected `RunFn` (`src/os/sound.ts`).
   Per status: nothing, one of the 14 sounds macOS ships in `/System/Library/Sounds`, or any file
   the user points at.
4. **Only `blocked` and `done`**, matching what `detectFlips` can deliver.
5. **The default is silence**, and every unparseable stored value falls back to it. A fresh
   install therefore makes *one* sound per flip — herdr's chime — where it used to make two, and
   nothing doubles until the user opts in.
6. **The clash is detected and surfaced.** `src/herdr/config.ts` reads `[ui.sound] enabled`; when
   the deck has a sound configured and herdr's chime is on, the inspector says so and offers to
   turn it off. Silence there would have cost exactly the debugging round this ADR came out of.

### Writing to the user's herdr config

The button in the inspector edits `~/.config/herdr/config.toml` to set `[ui.sound] enabled =
false`, then runs `herdr server reload-config` so it takes effect without a restart.

**This does not contradict ADR 0002's refusal of `agent.view.set`.** That was rejected because
*rendering a key* would have rewritten the user's own panel — an implicit, repeated,
invisible mutation as a side effect of drawing. This is a single edit, behind a labelled button,
that the user clicks knowing what it does, with the previous file copied to `config.toml.bak-<epoch>`
first. herdr sets the precedent itself: `herdr config reset-keys` backs the file up before
editing it. The rule is "don't mutate the user's config as a side effect", not "never write".

The rewrite is line-level rather than a TOML parse-and-serialize, because a round trip would
reformat and strip the comments out of a file the user hand-wrote. It handles the key being
present (replace in place, commented or not), the section existing without it (insert), and no
section at all (append) — and a commented `# enabled = true` is replaced where it sits rather than
duplicated below, so the setting stays where the user expects to find it.

`parseSoundEnabled` is **section-aware**, unlike `parseAgentPanelSort`: `enabled` is a common key
name that appears under other tables, so a bare line match would read `[update]`'s setting and
report the wrong thing.

### Why global, not per key

Notifications fire from the store subscription, once per flip, over *agents* — there is no key in
hand. And keys are positional (ADR 0002), so a per-key sound would follow the deck position rather
than the agent: the same key would sound different depending on which row of herdr's panel landed
there. Settings therefore live in the plugin's global settings
(`streamDeck.settings.*GlobalSettings`), edited from the Agent Slot inspector under an explicit
"Apply to every key" heading only because Stream Deck has no global property inspector.

### Correcting ADR 0002 on sdpi's `global`

ADR 0002 records that PR #4's `global="pageSize"` "rendered a working-looking control that
persisted nothing", and concluded the binding was broken. Half right, and worth stating precisely
because this feature depends on it working.

`global` is a **boolean** attribute — `attribute:"global", type:Boolean` in `sdpi-components.js` —
and the settings *key* comes from `setting`. `global="pageSize"` therefore means "this is global"
with no key at all, and the binding is guarded on `if (this.setting)`. Written as
`setting="soundBlocked" global`, it persists correctly.

This does not reopen the page-size decision. That control was rejected for reading as a per-key
setting *and* for being derivable from the deck; the first still applies here, which is why this
one is labelled, and the second does not, because a sound preference cannot be derived.

## Options considered

**A. Map each status onto herdr's `none|done|request`.** No new I/O, no path validation. Rejected:
three keywords over two sounds cannot give a distinct sound per status, and every one of them
stacks on herdr's chime — it is the bug, dressed as a feature.

**B. Write the user's sounds into herdr's `[ui.sound]` `done_path`/`request_path`.** herdr can
already play custom mp3s. Rejected: still only two slots, and it makes the deck's settings change
what the user hears in the terminal. The `enabled = false` write is deliberately narrower — it
*stops* herdr sounding rather than repurposing herdr's sounds for the deck.

**C. Leave the clash undocumented and let users find it.** Rejected on evidence: it took a live
debugging session with a config diff to work out, by someone who had already written a workaround
for half of it.

**D. Silently disable herdr's chime on first run.** Rejected: it is the user's config and their
terminal's behaviour. The button exists precisely so the change is theirs.

## Consequences

**Good**

- One sound per flip. The original double-sound bug is gone even for users who never open the
  inspector, because the plugin stopped asking for a notification sound at all.
- A distinct sound per attention status, from a named list, with any file as the escape hatch.
- The audio path is pure-function-plus-thin-IO like everything else: `soundPathFor` decides,
  `SoundPlayer` executes, neither knows about Stream Deck.
- The clash is diagnosable from the inspector *and* the plugin log, rather than by reading
  herdr's config by hand.

**Bad, and accepted**

- **macOS-only.** `afplay` and `/System/Library/Sounds` are the platform-specific half of this
  feature; a port swaps the catalog and the play command and nothing else. The rest of
  `src/os/*` is a much larger obstacle to a Windows build, and `manifest.json` already declares
  `"Platform": "mac"`.
- **The plugin writes to a file it does not own.** Mitigated by the click, the backup, and the
  line-level rewrite — but it is a real capability that did not exist before, and the section-
  aware parse is the only thing standing between it and the wrong table.
- **A silent default reads as "broken" to someone expecting sound.** Accepted: the alternative
  is shipping a default that doubles with herdr on every install.
- **A custom file is a path, and paths go stale.** A moved file fails at play time, logged via
  `onWarn`; the notification still fires. The path is checked as absolute and non-flag-like at
  both parse and call time, because it becomes an `afplay` argument.
- **The inspector lists the 14 sounds as static markup.** The bundled `sdpi-components.js` has no
  `datasource` support, so the names are duplicated between `SYSTEM_SOUNDS` and `slot.html`; a
  test reads the HTML and asserts they agree.
- **A global setting shown on a key's inspector still looks per-key** — ADR 0002's original
  objection, mitigated with a heading, not solved.
- **`working` / `idle` / `unknown` stay silent and unconfigurable**, because `detectFlips` filters
  on `isAttention`. Generalizing it means idle↔working flips, which on a busy machine are
  constant — 11 of 12 agents were idle at rest when ADR 0002 was written.

## Revisit when

herdr's `notification.show` gains a per-call sound file, which would let herdr sound its own
notifications correctly and retire `src/os/sound.ts`. Also on any port off macOS: the sound
catalog and play command are the pieces to swap, and `SYSTEM_SOUNDS` / `SYSTEM_SOUND_DIR` are
where the assumption is written down.

## References

- `soundPathFor` / `parseSoundChoice` in `src/core/sounds.ts`, covered by `sounds.test.ts`
- `createSoundPlayer` in `src/os/sound.ts` — argv and failure behaviour, `sound.test.ts`
- `parseSoundEnabled` / `withSoundEnabled` in `src/herdr/config.ts` — the section-aware read and
  the three rewrite shapes, `config.test.ts`
- herdr's sound surface: `herdr --default-config` → `[ui.sound]`, and
  `herdr notification show --help` → `--sound [none|done|request]`
- Global settings API: `node_modules/@elgato/streamdeck/dist/plugin/settings.d.ts`; PI messaging:
  `dist/plugin/ui.d.ts` (`sendToPropertyInspector`, `onSendToPlugin`)
- [ADR 0002](0002-deck-mirrors-herdr-order.md) — positional keys, the no-global-inspector
  constraint, and the `agent.view.set` refusal this decision is measured against
