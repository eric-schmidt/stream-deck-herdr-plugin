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
import { pageCount, attentionAgents, worstAttention } from "../core/pagination";
import { renderPagerSvg, renderAttentionSvg } from "../core/render";

// One key, two modes. When any agent is blocked or done it acts as "jump to the
// next agent needing attention" (focus + cycle on repeat presses); otherwise it
// pages through the agent grid. The rendered icon shows which mode is active, so
// a single key covers both jobs on the 6-key Mini.
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
    const list = attentionAgents(this.store.getState().agents);
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

  renderAll(): void {
    const { agents, page } = this.store.getState();
    const attention = attentionAgents(agents);
    const svg =
      attention.length > 0
        ? renderAttentionSvg({ count: attention.length, attention: worstAttention(agents) })
        : renderPagerSvg({
            page,
            total: pageCount(agents.length, this.store.getPageSize()),
            attention: null,
            count: 0,
          });
    this.actions.forEach((a) => {
      if (a.isKey()) void a.setImage(svg);
    });
  }
}
