import streamDeck, {
  action,
  SingletonAction,
  type WillAppearEvent,
  type KeyDownEvent,
} from "@elgato/streamdeck";
import type { AgentStore } from "../core/store";
import type { HerdrClient } from "../herdr/client";
import { attentionAgents, worstAttention } from "../core/pagination";
import { renderAttentionSvg } from "../core/render";

@action({ UUID: "dev.timvdhoorn.herdr-agents.attention" })
export class AttentionAction extends SingletonAction {
  // paneId of the agent we last jumped to, so repeated presses cycle forward.
  #cursor: string | null = null;

  constructor(
    private readonly store: AgentStore,
    private readonly herdr: HerdrClient,
  ) {
    super();
  }

  override onWillAppear(_ev: WillAppearEvent): void {
    this.renderAll();
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    const list = attentionAgents(this.store.getState().agents);
    if (list.length === 0) return;
    const at = list.findIndex((a) => a.paneId === this.#cursor);
    const next = list[(at + 1) % list.length]; // at === -1 → starts at 0
    this.#cursor = next.paneId;
    try {
      await this.herdr.focus(next.paneId);
    } catch (e) {
      streamDeck.logger.error(`attention focus failed: ${String(e)}`);
    }
  }

  renderAll(): void {
    const agents = this.store.getState().agents;
    const list = attentionAgents(agents);
    const svg = renderAttentionSvg({ count: list.length, attention: worstAttention(agents) });
    this.actions.forEach((a) => {
      if (a.isKey()) void a.setImage(svg);
    });
  }
}
