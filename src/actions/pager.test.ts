// src/actions/pager.test.ts
import { test, expect } from "bun:test";
import { PagerAction } from "./pager";
import { createAgentStore } from "../core/store";
import type { RawAgent } from "../core/agents";

const raw = (status: string, paneId: string): RawAgent => ({
  agent: "claude",
  agent_status: status,
  cwd: "/x/proj",
  pane_id: paneId,
  workspace_id: paneId.slice(0, 2),
});

// The pager only pages. It used to hijack the press to jump to an off-page agent needing
// attention, which made paging unpredictable once the deck started mirroring herdr's order.
test("pressing the pager advances the page even when an off-page agent is blocked", async () => {
  const store = createAgentStore({
    fetchAgents: async () => [raw("idle", "w1:p1"), raw("blocked", "w2:p1")],
    pageSize: 1, // one key: the blocked agent is on page 2, off the visible page
  });
  await store.pollNow();
  const pager = new PagerAction(store);

  await pager.onKeyDown(undefined as never);

  expect(store.getState().page).toBe(1);
});
