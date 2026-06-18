// src/plugin.ts
import streamDeck from "@elgato/streamdeck";
import { createHerdrClient } from "./herdr/client";
import { createAgentStore } from "./core/store";
import { AgentSlotAction } from "./actions/slot";
import { PagerAction } from "./actions/pager";

streamDeck.logger.setLevel("info");

const herdr = createHerdrClient();
const store = createAgentStore({ fetchAgents: () => herdr.listAgents() });

const slot = new AgentSlotAction(store, herdr);
const pager = new PagerAction(store, herdr);

store.subscribe(() => {
  slot.renderAll();
  pager.renderAll();
});

streamDeck.actions.registerAction(slot);
streamDeck.actions.registerAction(pager);

streamDeck.connect();
store.start(1000);
