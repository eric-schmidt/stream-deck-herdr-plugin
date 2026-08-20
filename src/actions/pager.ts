// src/actions/pager.ts
import {
  action,
  SingletonAction,
  type WillAppearEvent,
  type KeyDownEvent,
} from "@elgato/streamdeck";
import type { AgentStore } from "../core/store";
import { pageCount, offPageWorstAttention, offPageAttentionCount } from "../core/pagination";
import { renderPagerSvg } from "../core/render";

// One key, one job: page. The badge reports blocked/done agents the visible page cannot
// show, but it is a read-out, not a mode — it never intercepts the press. A press used to
// jump to the badged agent instead, which made paging unpredictable once the deck started
// mirroring herdr: under herdr's `priority` sort attention already bubbles to the top, so
// the jump mostly re-focused what was already on screen and swallowed the paging press.
// See the 2026-08-20 update on ADR 0002.
@action({ UUID: "dev.timvdhoorn.herdr-agents.pager" })
export class PagerAction extends SingletonAction {
  constructor(private readonly store: AgentStore) {
    super();
  }

  override onWillAppear(_ev: WillAppearEvent): void {
    this.renderAll();
  }

  override onKeyDown(_ev: KeyDownEvent): void {
    this.store.nextPage();
  }

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
