// src/actions/slot.ts
import streamDeck, {
  action,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type KeyUpEvent,
} from "@elgato/streamdeck";
import type { AgentStore } from "../core/store";
import type { HerdrClient } from "../herdr/client";
import { pageSlice, PAGE_SIZE } from "../core/pagination";
import { labelFor } from "../core/agents";
import { renderKeySvg } from "../core/render";

type SlotSettings = { slotIndex?: number };

// Press-length threshold: below this a key press focuses the agent, at/above it
// the press toggles a pin.
const LONG_PRESS_MS = 400;

@action({ UUID: "dev.timvdhoorn.herdr-agents.slot" })
export class AgentSlotAction extends SingletonAction<SlotSettings> {
  readonly #slots = new Map<string, number>(); // action instance id -> slot index
  readonly #pressStart = new Map<string, number>(); // action instance id -> keydown timestamp

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

  override onKeyDown(ev: KeyDownEvent<SlotSettings>): void {
    this.#pressStart.set(ev.action.id, Date.now());
  }

  override onKeyUp(ev: KeyUpEvent<SlotSettings>): void {
    const start = this.#pressStart.get(ev.action.id);
    this.#pressStart.delete(ev.action.id);
    const index = Number(ev.payload.settings.slotIndex ?? 0);
    const { agents, page } = this.store.getState();
    const agent = pageSlice(agents, page, PAGE_SIZE)[index];
    if (!agent) return;
    const longPress = start !== undefined && Date.now() - start >= LONG_PRESS_MS;
    if (longPress) {
      // Long-press pins: the agent jumps to slot 1 (next pin beside it) and
      // stays visible even when idle. The store emit re-renders all keys.
      this.store.togglePin(agent.paneId);
    } else {
      void this.#focus(agent.paneId);
    }
  }

  async #focus(paneId: string): Promise<void> {
    try {
      await this.herdr.focus(paneId);
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
          agent
            ? {
                label: labelFor(agent, agents),
                status: agent.status,
                agent: agent.name,
                pinned: this.store.isPinned(agent.paneId),
              }
            : null,
        ),
      );
    });
  }
}
