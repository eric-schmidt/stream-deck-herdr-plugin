// src/actions/slot.ts
import streamDeck, {
  action,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
} from "@elgato/streamdeck";
import type { AgentStore } from "../core/store";
import type { HerdrClient } from "../herdr/client";
import { pageSlice, PAGE_SIZE } from "../core/pagination";
import { labelFor } from "../core/agents";
import { renderKeySvg } from "../core/render";

type SlotSettings = { slotIndex?: number };

@action({ UUID: "dev.timvdhoorn.herdr-agents.slot" })
export class AgentSlotAction extends SingletonAction<SlotSettings> {
  readonly #slots = new Map<string, number>(); // action instance id -> slot index

  constructor(
    private readonly store: AgentStore,
    private readonly herdr: HerdrClient,
  ) {
    super();
  }

  override onWillAppear(ev: WillAppearEvent<SlotSettings>): void {
    this.#slots.set(ev.action.id, Number(ev.payload.settings.slotIndex ?? 0));
    this.renderAll();
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<SlotSettings>): void {
    this.#slots.set(ev.action.id, Number(ev.payload.settings.slotIndex ?? 0));
    this.renderAll();
  }

  override onWillDisappear(ev: WillDisappearEvent<SlotSettings>): void {
    this.#slots.delete(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent<SlotSettings>): Promise<void> {
    const index = Number(ev.payload.settings.slotIndex ?? 0);
    const { agents, page } = this.store.getState();
    const agent = pageSlice(agents, page, PAGE_SIZE)[index];
    if (!agent) return;
    try {
      await this.herdr.focus(agent.paneId);
    } catch (e) {
      streamDeck.logger.error(`focus failed: ${String(e)}`);
    }
  }

  renderAll(): void {
    const { agents, page } = this.store.getState();
    const visible = pageSlice(agents, page, PAGE_SIZE);
    this.actions.forEach((a) => {
      if (!a.isKey()) return;
      const index = this.#slots.get(a.id) ?? 0;
      const agent = visible[index];
      void a.setTitle("");
      void a.setImage(
        renderKeySvg(
          agent ? { label: labelFor(agent, agents), status: agent.status, agent: agent.name } : null,
        ),
      );
    });
  }
}
