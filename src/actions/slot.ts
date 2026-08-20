// src/actions/slot.ts
import streamDeck, {
  action,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
  type DidReceiveSettingsEvent,
  type KeyUpEvent,
} from "@elgato/streamdeck";
import type { AgentStore } from "../core/store";
import type { HerdrClient } from "../herdr/client";
import type { TerminalActivator } from "../os/terminal";
import { pageSlice } from "../core/pagination";
import { assignSlots, type SlotKey } from "../core/slots";
import { labelFor, parseDisplayMode, type DisplayMode } from "../core/agents";
import { renderKeySvg } from "../core/render";

type SlotSettings = { display?: DisplayMode };

@action({ UUID: "dev.timvdhoorn.herdr-agents.slot" })
export class AgentSlotAction extends SingletonAction<SlotSettings> {
  // Where each key physically sits. Slot order is derived from this, never configured:
  // see `assignSlots` in src/core/slots.ts and ADR 0002.
  readonly #keys = new Map<string, SlotKey>();
  readonly #displays = new Map<string, DisplayMode>(); // action instance id -> display mode

  constructor(
    private readonly store: AgentStore,
    private readonly herdr: HerdrClient,
    private readonly terminal: TerminalActivator,
  ) {
    super();
  }

  // A key inside a multi-action has no coordinates — and could not usefully render a live
  // agent anyway — so it is dropped rather than handed a slot.
  #track(
    actionId: string,
    deviceId: string,
    coordinates: { row: number; column: number } | undefined,
  ): void {
    if (coordinates === undefined) {
      this.#keys.delete(actionId);
    } else {
      this.#keys.set(actionId, {
        id: actionId,
        deviceId,
        row: coordinates.row,
        column: coordinates.column,
      });
    }
    const { pageSize } = assignSlots([...this.#keys.values()]);
    // Keep the last known size when nothing is placed, so switching to a profile with no
    // slot keys does not make the pager advertise a page count from thin air.
    if (pageSize !== null) this.store.setPageSize(pageSize);
  }

  #indices(): Map<string, number> {
    return assignSlots([...this.#keys.values()]).indexById;
  }

  override onWillAppear(ev: WillAppearEvent<SlotSettings>): void {
    this.#displays.set(ev.action.id, parseDisplayMode(ev.payload.settings.display));
    this.#track(
      ev.action.id,
      ev.action.device.id,
      ev.action.isKey() ? ev.action.coordinates : undefined,
    );
    this.renderAll();
  }

  // Only `display` is a setting now; position comes from the deck, so nothing here can
  // change a key's slot.
  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<SlotSettings>): void {
    this.#displays.set(ev.action.id, parseDisplayMode(ev.payload.settings.display));
    this.renderAll();
  }

  override onWillDisappear(ev: WillDisappearEvent<SlotSettings>): void {
    this.#keys.delete(ev.action.id);
    this.#displays.delete(ev.action.id);
    const { pageSize } = assignSlots([...this.#keys.values()]);
    if (pageSize !== null) this.store.setPageSize(pageSize);
  }

  override onKeyUp(ev: KeyUpEvent<SlotSettings>): void {
    const index = this.#indices().get(ev.action.id);
    if (index === undefined) return;
    const { agents, page } = this.store.getState();
    const agent = pageSlice(agents, page, this.store.getPageSize())[index];
    if (!agent) return;
    void this.#focus(agent.paneId);
  }

  async #focus(paneId: string): Promise<void> {
    try {
      await this.herdr.focus(paneId);
    } catch (e) {
      streamDeck.logger.error(`focus failed: ${String(e)}`);
    }
    // Raise the host terminal so the focused pane is actually on screen even when
    // the terminal was in the background. Independent of focus so a raise failure
    // never masks a successful pane switch.
    try {
      await this.terminal.activate();
    } catch (e) {
      streamDeck.logger.error(`raise terminal failed: ${String(e)}`);
    }
  }

  // Flash the key currently showing this agent, if it is on the visible page.
  flash(paneId: string): void {
    const { agents, page } = this.store.getState();
    const visible = pageSlice(agents, page, this.store.getPageSize());
    const indexById = this.#indices();
    this.actions.forEach((a) => {
      if (!a.isKey()) return;
      const index = indexById.get(a.id);
      if (index !== undefined && visible[index]?.paneId === paneId) void a.showAlert();
    });
  }

  renderAll(): void {
    const { agents, page } = this.store.getState();
    const visible = pageSlice(agents, page, this.store.getPageSize());
    const indexById = this.#indices();
    this.actions.forEach((a) => {
      if (!a.isKey()) return;
      const index = indexById.get(a.id);
      const display = this.#displays.get(a.id) ?? "space";
      const agent = index === undefined ? undefined : visible[index];
      void a.setTitle("");
      void a.setImage(
        renderKeySvg(
          agent
            ? {
                label: labelFor(agent, agents, display),
                status: agent.status,
                agent: agent.name,
              }
            : null,
        ),
      );
    });
  }
}
