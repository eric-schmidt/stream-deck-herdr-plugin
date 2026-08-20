// src/actions/pager.ts
import streamDeck, {
  action,
  SingletonAction,
  type WillAppearEvent,
  type KeyDownEvent,
} from "@elgato/streamdeck";
import type { AgentStore } from "../core/store";
import type { HerdrClient } from "../herdr/client";
import type { TerminalActivator } from "../os/terminal";
import {
  pageCount,
  offPageWorstAttention,
  offPageAttentionCount,
  offPageAttentionAgents,
} from "../core/pagination";
import { renderPagerSvg } from "../core/render";

// One key, two modes, keyed on *off-page* attention. An agent that already has a key on
// the visible page needs no jump — it is on screen and pressable — so only attention that
// is off-page turns this into "jump to the next agent needing attention" (focus + cycle on
// repeat presses). Otherwise it pages. Testing all agents instead, as this once did, meant
// a single blocked agent anywhere permanently disabled paging.
@action({ UUID: "dev.timvdhoorn.herdr-agents.pager" })
export class PagerAction extends SingletonAction {
  // paneId we last jumped to, so repeated presses cycle through attention agents.
  #cursor: string | null = null;

  constructor(
    private readonly store: AgentStore,
    private readonly herdr: HerdrClient,
    private readonly terminal: TerminalActivator,
  ) {
    super();
  }

  override onWillAppear(_ev: WillAppearEvent): void {
    this.renderAll();
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    const { agents, page } = this.store.getState();
    const list = offPageAttentionAgents(agents, page, this.store.getPageSize());
    if (list.length === 0) {
      this.store.nextPage();
      return;
    }
    const at = list.findIndex((a) => a.paneId === this.#cursor);
    const next = list[(at + 1) % list.length]; // at === -1 → starts at 0
    this.#cursor = next.paneId;
    try {
      await this.herdr.focus(next.paneId);
    } catch (e) {
      streamDeck.logger.error(`attention focus failed: ${String(e)}`);
    }
    // Bring the host terminal forward too (no-op if already frontmost).
    try {
      await this.terminal.activate();
    } catch (e) {
      streamDeck.logger.error(`raise terminal failed: ${String(e)}`);
    }
  }

  // Always a pager; the badge (which renderPagerSvg has always supported) reports agents
  // needing attention that this page cannot show.
  renderAll(): void {
    const { agents, page } = this.store.getState();
    const pageSize = this.store.getPageSize();
    const svg = renderPagerSvg({
      page,
      total: pageCount(agents.length, pageSize),
      attention: offPageWorstAttention(agents, page, pageSize),
      count: offPageAttentionCount(agents, page, pageSize),
    });
    this.actions.forEach((a) => {
      if (a.isKey()) void a.setImage(svg);
    });
  }
}
