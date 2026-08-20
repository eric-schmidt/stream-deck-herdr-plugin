// src/core/pagination.ts
import type { Agent } from "./agents";
import { ATTENTION_RANK } from "./status";

// A `null` pageSize means no Agent Slot key has reported its position yet, so the page size
// genuinely is not known (see `assignSlots` in ./slots.ts). Nothing is paged in that state,
// so it is all one page — rather than inventing a number and having the pager advertise
// pages no key can show. Handled here so no call site has to branch. Note a sentinel of
// `Infinity` looks equivalent but is not: `page * Infinity` is NaN, and `slice(NaN, NaN)`
// silently returns nothing.
export function pageCount(count: number, pageSize: number | null): number {
  if (pageSize === null) return 1;
  return Math.max(1, Math.ceil(count / pageSize));
}

export function clampPage(page: number, pages: number): number {
  if (page < 0) return 0;
  const max = Math.max(0, pages - 1);
  return page > max ? max : page;
}

export function pageSlice(agents: Agent[], page: number, pageSize: number | null): Agent[] {
  if (pageSize === null) return agents.slice();
  const start = page * pageSize;
  return agents.slice(start, start + pageSize);
}

type Attention = "blocked" | "done";

function isOffPage(index: number, page: number, pageSize: number): boolean {
  const start = page * pageSize;
  return index < start || index >= start + pageSize;
}

// Off-page attention drives the pager's badge: an agent that already has a key on the
// visible page needs no badge — you can see it and press it. When unpaged (null) nothing
// is off-page.
export function offPageWorstAttention(
  agents: Agent[],
  page: number,
  pageSize: number | null,
): Attention | null {
  if (pageSize === null) return null;
  return agents.reduce<Attention | null>((best, agent, index) => {
    if (!isOffPage(index, page, pageSize)) return best;
    const rank = ATTENTION_RANK[agent.status] ?? 0;
    const bestRank = best ? ATTENTION_RANK[best] : 0;
    return rank > bestRank ? (agent.status as Attention) : best;
  }, null);
}

// How many the badge stands for: when more than one, it shows the count instead of a glyph.
export function offPageAttentionCount(
  agents: Agent[],
  page: number,
  pageSize: number | null,
): number {
  if (pageSize === null) return 0;
  return agents.filter(
    (agent, index) =>
      isOffPage(index, page, pageSize) && (ATTENTION_RANK[agent.status] ?? 0) > 0,
  ).length;
}


