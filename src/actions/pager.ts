// src/actions/pager.ts
import { action, SingletonAction, type WillAppearEvent, type KeyDownEvent } from "@elgato/streamdeck";
import type { AgentStore } from "../core/store";
import {
  pageCount,
  offPageWorstAttention,
  offPageAttentionCount,
  PAGE_SIZE,
} from "../core/pagination";
import { renderPagerSvg } from "../core/render";

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
    const total = pageCount(agents.length, PAGE_SIZE);
    const attention = offPageWorstAttention(agents, page, PAGE_SIZE);
    const count = offPageAttentionCount(agents, page, PAGE_SIZE);
    this.actions.forEach((a) => {
      if (a.isKey()) void a.setImage(renderPagerSvg({ page, total, attention, count }));
    });
  }
}
