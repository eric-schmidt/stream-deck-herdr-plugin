// src/plugin.ts
import streamDeck from "@elgato/streamdeck";
import { createHerdrClient } from "./herdr/client";
import { createAgentStore } from "./core/store";
import { AgentSlotAction } from "./actions/slot";
import { PagerAction } from "./actions/pager";
import { createHerdrEvents } from "./herdr/events";

streamDeck.logger.setLevel("info");

const herdr = createHerdrClient();
const store = createAgentStore({ fetchAgents: () => herdr.listAgents() });

const slot = new AgentSlotAction(store, herdr);
const pager = new PagerAction(store, herdr);

store.subscribe(() => {
  slot.renderAll();
  pager.renderAll();
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
