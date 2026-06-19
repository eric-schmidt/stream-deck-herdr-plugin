// src/plugin.ts
import streamDeck from "@elgato/streamdeck";
import { createHerdrClient } from "./herdr/client";
import { createTerminalActivator } from "./os/terminal";
import { createAgentStore } from "./core/store";
import { AgentSlotAction } from "./actions/slot";
import { PagerAction } from "./actions/pager";
import { createHerdrEvents } from "./herdr/events";
import { detectFlips } from "./core/transitions";
import { labelFor } from "./core/agents";
import type { Agent } from "./core/agents";

streamDeck.logger.setLevel("info");

const herdr = createHerdrClient();
// undefined app → default (iTerm); set HERDR_DECK_TERMINAL_APP to override.
const terminal = createTerminalActivator({ app: process.env.HERDR_DECK_TERMINAL_APP });
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
