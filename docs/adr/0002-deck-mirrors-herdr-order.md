# ADR 0002 — The deck mirrors herdr; slots are positional, not configured

- **Status:** Accepted — breaking change to Agent Slot settings; revisit when a layout needs
  a page size that differs from the key count
- **Date:** 2026-08-19
- **Affects:** `src/core/slots.ts`, `src/core/agents.ts` (`normalize`, `sortForPanel`, `labelFor`),
  `src/herdr/client.ts` (`listWorkspaces`),
  `src/herdr/config.ts`, `src/core/store.ts`,
  `src/core/pagination.ts`, `src/actions/slot.ts`, `src/actions/pager.ts`,
  `dev.timvdhoorn.herdr-agents.sdPlugin/ui/slot.html`

## Context

Setting the plugin up meant dragging Agent Slot keys onto the deck and then opening each
one's property inspector to assign it a `slotIndex`. The grid was then paginated with a
hardcoded `PAGE_SIZE = 5`. Reviewing a proposal to make that page size configurable
(PR #4) surfaced four problems, three of them bugs rather than preferences.

**Paging was dead on any deck under six keys.** `pageCount(n, 5)` is 1 whenever fewer than
six agents fit, so `nextPage()` computed `(0 + 1) % 1 = 0`. Measured with 2 agents and one
slot key: `page 0 -> 0`, no change. Anyone with a 6-key Mini and one or two slot keys had a
pager that did nothing. PR #4 diagnosed this correctly; only its remedy is rejected here.

**The deck showed agents in the wrong order.** `normalize` sorted lexically by
`workspaceId`. herdr's workspace ids run `w0…w9`, `wA…wZ`, `w10`, `w11`, … so a lexical
sort puts `w0` and `w12` *before* `w8`. Measured against a live 12-workspace session:

```
herdr display order (workspace numbers):  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
what normalize() produced:                [11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
```

The first key on the deck showed herdr's *eleventh* row. Nothing about the deck corresponded
to what the terminal showed.

**A plugin-wide setting has nowhere to live.** Stream Deck has no global property inspector:
`GlobalPropertyInspectorPath` is absent from every `Software.MinimumVersion` branch of the
manifest schema — each is `additionalProperties: false` — and `streamdeck pack` rejects it.
A plugin-wide control can therefore only be rendered inside some *action's* inspector, where
it appears on every Agent Slot key and reads as a per-key setting.

**The agent panel has two orderings, and only one is what the CLI returns.** herdr's own
config template documents them:

```
# Agent panel ordering: "spaces" (grouped by space) or "priority" (attention queue).
# "workspaces" is accepted as an alias for "spaces".
# agent_panel_sort = "spaces"
```

`herdr agent list` always returns **spaces** order. A user on `priority` therefore sees a
different order in the panel than the CLI reports — which is the second way the deck could
disagree with the terminal, independent of the sorting bug above.

**Slot order was being asked of the user, but the plugin already knows it.**
`KeyAction.coordinates` reports `{row, column}`, and `herdr agent list` already returns
agents in herdr's own display order — verifiable against `herdr api snapshot`, where the
agents array maps 1:1 onto `workspaces[].number`.

## Decision

**The deck is a window onto herdr's list, and nothing about the grid is configured.**

1. **`normalize` preserves herdr's order.** No sorting of its own. herdr's array order *is*
   the panel's order under the default `spaces` sort, so deck position N is herdr row N.
   When `agent_panel_sort = "priority"`, `sortForPanel` reproduces the attention queue
   instead — attention first, then most-recently-changed. The setting is read from
   `~/.config/herdr/config.toml` on each refresh (`src/herdr/config.ts`).
2. **Slot index is the key's position.** Keys are grouped by device, sorted by
   `(row, column)`, and ranked — reading order, left-to-right and top-to-bottom
   (`assignSlots` in `src/core/slots.ts`). `slotIndex` is gone from the property inspector,
   which now holds only **Display**.
3. **Page size is the number of placed keys**, pushed into the store from
   `src/actions/slot.ts` as keys appear and disappear.
4. **Every agent is shown, idle included**, so the mirror is exact.
5. **Pinning is removed.** Long-press moved an agent to slot 1, which is a direct override of
   herdr's order.
6. **The pager keys off *off-page* attention.** It jumps only when something needing
   attention is not visible; otherwise it pages.
7. **A key is named by its space.** herdr names an agent after its space, and that name is
   renameable — which users do precisely so it reads well on a key. `herdr agent list` does
   not carry it, so it is joined in from `herdr workspace list` on `workspace_id`
   (1810 bytes against 21562 for `api snapshot`, and it leaves the existing `listAgents`
   parse untouched). The fallback chain is space label → cwd basename → agent binary, so a
   missing or failed lookup degrades instead of blanking a key.

   The cwd label was dropped as a *choice* rather than kept alongside: herdr seeds a space's
   name from its directory, so the two agree until a rename, and offering both would ask the
   user to distinguish options that are usually identical. `Display` now offers **Space name**
   or **Terminal title**; a stored legacy `"project"` maps to `space` via `parseDisplayMode`.

### Reproducing the panel sort

herdr cannot sort this for us. `agent.list` takes `EmptyParams` — no sort argument — and
while `agent.view.set` accepts a sort, it takes a required `source` and has a matching
`agent.view.clear`, so it configures the user's *own* panel; a Stream Deck plugin must not
rewrite someone's terminal UI to render a key. So the order is reproduced locally.

The ranking mirrors herdr's builtin sort fields, which its API schema enumerates as
`workspace_order | tab_order | pane_order | attention | status | agent | seen |
state_change_seq`. `priority` is `attention` descending, tie-broken by `state_change_seq`
descending — confirmed against a live panel. The comparator itself is undocumented, so a
future mismatch is more likely a herdr change than a bug here; `sortForPanel` says so in a
comment.

Reading the config is deliberately a one-key regex rather than a TOML parse: herdr ships its
default config with every line **commented out**, so a naive search reads the commented
example as the live value and silently picks the wrong order. That case is covered by a test.

### The load-bearing detail

**Devices mirror; page size is the largest per-device count.** Ordering keys across devices
would have to sort on `deviceId`, an opaque id — so which deck received the low indices
would be arbitrary and could change between sessions. Each device therefore ranks its own
keys from 0 and shows the same agents.

Because the store holds one page and one page size, that size is the **maximum** per-device
count, not the sum: a 5-key deck and a 3-key deck then show agents 0–4 and 0–2 of the same
page. The sum would page in strides no single deck can display; the minimum would leave the
larger deck's keys permanently blank.

**"Not yet known" is `null`, not a default.** Page size is read before any key can have
reported — the pager renders `page X/Y`, and `willAppear` ordering between the two action
types is not the plugin's to control — and it is never inferred on a profile holding a pager
but no slot keys. Seeding a number there fabricates pages: with 12 agents and nothing placed,
a seed of 5 makes the pager advertise `1/3` when the honest answer is `1/1`. So
`pageCount`/`pageSlice` treat `null` as unpaged — one page holding everything — and that
branch lives in those two pure functions so no call site has to handle it.

**Indices stay dense.** Because they are ranks rather than user-supplied numbers, a key
sitting alone at column 4 is slot 1, not slot 5, and there are no unreachable slots.

## Options considered

**A. Make page size a configurable global setting** (PR #4, implemented then rejected).
Rejected: it has no single home, because no global property inspector exists — so the control
lands on every slot key and reads as per-key. It also asks the user for a number the plugin
can derive. Worth recording that its binding was also silently broken: sdpi-components treats
`global` as a **boolean** attribute and takes the key from `setting`, with the binding guarded
on `if (this.setting)`, so `global="pageSize"` rendered a working-looking control that
persisted nothing.

**B. Move the page-size control to a Pager-only property inspector.** The pager has no
inspector, so this would give the setting exactly one home. Rejected: still configuration for
something derivable, and unreachable on a layout with slot keys but no pager — which
`README.md` explicitly recommends.

**C. Infer page size from the *count* of keys while keeping manual `slotIndex`.** Rejected:
with user-assigned indices the count is wrong. Non-contiguous indices (0, 1, 7) would give 3,
leaving key 7 permanently unfillable, and two decks each running 0–4 would sum to 10. Under
positional assignment indices are dense, so the count is correct — the flaw was in keeping
manual indices, not in counting.

**D. Keep pinning alongside the mirror.** Rejected: pinning exists to move an agent to slot 1,
which is precisely an override of herdr's order. Its second purpose — keeping an agent visible
when idle — disappears entirely once idle agents are always shown.

**E. A sentinel of `Infinity` for an unknown page size.** Tempting, since
`pageCount(n, Infinity)` is already 1 with no branch. Rejected: `pageSlice` computes
`page * pageSize`, and `0 * Infinity` is `NaN`, so `slice(NaN, NaN)` silently returns an
empty array. Safe only by accident today.

## Consequences

**Good**

- Setup is drag-and-drop: place Agent Slot keys and a Pager, configure nothing.
  `README.md`'s "Configuration: None required" is true of the grid as well.
- The deck matches the terminal. Verified against a live 12-agent session: store order is
  byte-identical to `herdr agent list`, and paging walks rows 1–5, 6–10, 11–12.
- Paging works on small decks, where it was previously inert.
- Adding, moving, or removing a key re-derives everything on the next
  `willAppear`/`willDisappear`. Nothing to keep in sync.
- The pager stops being mysterious. Jumping to an agent already on screen — which is what it
  did whenever *any* agent was blocked — no longer suppresses paging.
- Three orphans are retired: `offPageWorstAttention`/`offPageAttentionCount` (unused since
  `036caae`) are now load-bearing, and `renderPagerSvg`'s long-dead `attention`/`count` badge
  parameters finally receive real values.

**Bad, and accepted**

- **Breaking change.** Saved `slotIndex` values are ignored, so an existing layout may
  rearrange once on upgrade. Honouring them would reintroduce the two-mode complexity this
  removes and make page size ambiguous again.
- Idle agents now consume keys. On a busy machine they dominate — 11 of 12 agents were idle
  when this was written — so the deck is mostly idle rows and pagination is essential rather
  than optional. That is the cost of an exact mirror.
- Page size ramps as keys appear at startup, so the first paint can show a transient page
  count. `setPageSize` no-ops when unchanged, so the ramp costs a handful of renders.
- An empty key set deliberately **keeps the last known page size** rather than resetting, so
  switching to a pager-only profile does not make the pager invent a page count. The value is
  then stale but harmless, since no slot key is visible.
- Page size can no longer differ from the key count. A user wanting 3 agents per page across
  5 physical keys cannot express that.
- The `priority` comparator is reproduced from observed behaviour, not a documented contract.
  If herdr changes how its attention queue ranks or tie-breaks, the deck drifts until this is
  updated. `spaces` mode is safe, since it is simply herdr's own list order.
- The config file is re-read every few seconds rather than watched, so a
  `herdr server reload-config` takes effect on the deck within one refresh rather than
  instantly.
- Losing pinning means no way to hold one agent in a fixed position. The pager's
  jump-to-attention covers the case that motivated it.
- **Space names longer than 24 characters ellipsize.** That is the render budget, not an
  arbitrary cap: `renderKeySvg` wraps with `wrapLabel(label, 8, 3)`, so 8 characters × 3
  lines is what an 80×80 key holds at the current font size. Three of eleven names in the
  maintainer's session exceed it. Naming spaces for the deck is the intended fix; widening
  the budget is a separate rendering change.
- Two spaces may share a name — herdr allows it, and auto-naming from the directory makes it
  likely. `labelFor` numbers collisions `#1`/`#2` by `paneId`, so a key keeps its number as
  agents come and go rather than renumbering with the page.
- One more subprocess per refresh (`herdr workspace list` alongside `agent list`), resolved
  concurrently. Negligible at poll rates, and the workspace call is non-fatal by design.

## Revisit when

A layout appears where the visible key count and the desired page size genuinely differ — a
profile paging a large agent list through a deliberately small window, say. That is the one
thing inference cannot express. Prefer a Pager-only inspector (option B) over a global setting
if it ever earns its place. Also revisit if herdr exposes an explicit ordering or grouping
field, which would let the mirror follow a user-chosen sort rather than workspace number.

## References

- `assignSlots` in `src/core/slots.ts` — positional assignment, covered by `slots.test.ts`
- `normalize` in `src/core/agents.ts` — the do-not-sort rule and why
- `pageCount` / `pageSlice` / `offPageAttentionAgents` in `src/core/pagination.ts` — the
  `null`-is-unpaged and off-page contracts
- `sortForPanel` in `src/core/agents.ts` and `parseAgentPanelSort` in `src/herdr/config.ts`
- herdr's sort vocabulary: `herdr api schema --json` → `AgentViewBuiltinSortField`; the mode
  itself is `[ui] agent_panel_sort` in `~/.config/herdr/config.toml`
- Ordering is checkable at runtime: `herdr api snapshot` → `workspaces[].number` versus the
  order of `herdr agent list`
- Manifest schema: `node_modules/@elgato/schemas/streamdeck/plugins/manifest.json`, where the
  absence of any global-inspector property is verifiable per `Software.MinimumVersion`
- Supersedes PR #4 (`feat: make page size configurable via global plugin settings`) and
  PR #5 (`feat: show recently-used idle sessions`), the latter subsumed by showing idle
  agents in herdr order
