// src/plugin.ts
import streamDeck from "@elgato/streamdeck";
import { createHerdrClient } from "./herdr/client";
import { createTerminalActivator, parseTerminalTab, TAB_UNSET } from "./os/terminal";
import { createHostTerminalResolver } from "./os/hostterminal";
import { createAgentStore } from "./core/store";
import { AgentSlotAction } from "./actions/slot";
import { PagerAction } from "./actions/pager";
import { createHerdrEvents } from "./herdr/events";
import { detectFlips } from "./core/transitions";
import { labelFor } from "./core/agents";
import type { Agent } from "./core/agents";

streamDeck.logger.setLevel("info");

const herdr = createHerdrClient();
// The host terminal is discovered from the attached herdr client, so neither env var is
// normally needed; both are overrides. Setting HERDR_DECK_TERMINAL_APP skips discovery
// (and with it exact-tab focusing), HERDR_DECK_TERMINAL_TAB opts into a Cmd-N keystroke.
const terminalApp = process.env.HERDR_DECK_TERMINAL_APP;
const terminalTab = parseTerminalTab(process.env.HERDR_DECK_TERMINAL_TAB);
// Say so when an override is in play. These variables are inherited from whatever
// launched the Stream Deck app, so a stale value can silently defeat discovery — and
// without a log line the only way to notice is to inspect process environments.
if (terminalApp !== undefined) {
  streamDeck.logger.info(
    `host terminal: HERDR_DECK_TERMINAL_APP=${terminalApp} overrides discovery (no exact-tab focus)`,
  );
}
if (terminalTab !== TAB_UNSET) {
  streamDeck.logger.info(`host terminal: HERDR_DECK_TERMINAL_TAB=${terminalTab} keystroke enabled`);
}
const terminal = createTerminalActivator({
  resolver: createHostTerminalResolver({ onWarn: (m) => streamDeck.logger.info(m) }),
  app: terminalApp,
  tab: terminalTab,
});
const store = createAgentStore({ fetchAgents: () => herdr.listAgents() });

const slot = new AgentSlotAction(store, herdr, terminal);
const pager = new PagerAction(store, herdr, terminal);

let prevAgents: Agent[] | null = null;

store.subscribe((s) => {
  slot.renderAll();
  pager.renderAll();

  if (prevAgents === null) { prevAgents = s.agents; return; } // prime, no alert on first snapshot
  const flips = detectFlips(prevAgents, s.agents);
  prevAgents = s.agents;
  for (const a of flips) {
    const sound = a.status === "blocked" ? "request" : "done";
    void herdr.notify(`${labelFor(a, s.agents)} ${a.status}`, { body: a.name, sound });
    slot.flash(a.paneId);
  }
});

// Debounce refreshes so a burst of socket events causes at most one poll.
let pending: ReturnType<typeof setTimeout> | null = null;
const refresh = (): void => {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    void store.pollNow();
  }, 150);
};

const events = createHerdrEvents({ onChange: refresh });

streamDeck.actions.registerAction(slot);
streamDeck.actions.registerAction(pager);

streamDeck.connect();
store.start(3000); // safety net; socket events drive the fast path
events.start();
