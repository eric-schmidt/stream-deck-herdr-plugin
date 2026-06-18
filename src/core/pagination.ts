// src/core/pagination.ts
import type { Agent } from "./agents";
import { ATTENTION_RANK } from "./status";

export const PAGE_SIZE = 5;

export function pageCount(count: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

export function clampPage(page: number, pages: number): number {
  if (page < 0) return 0;
  const max = Math.max(0, pages - 1);
  return page > max ? max : page;
}

export function pageSlice(agents: Agent[], page: number, pageSize = PAGE_SIZE): Agent[] {
  const start = page * pageSize;
  return agents.slice(start, start + pageSize);
}

type Attention = "blocked" | "done";

function isOffPage(index: number, page: number, pageSize: number): boolean {
  const start = page * pageSize;
  return index < start || index >= start + pageSize;
}

export function offPageWorstAttention(
  agents: Agent[],
  page: number,
  pageSize = PAGE_SIZE,
): Attention | null {
  return agents.reduce<Attention | null>((best, agent, index) => {
    if (!isOffPage(index, page, pageSize)) return best;
    const rank = ATTENTION_RANK[agent.status] ?? 0;
    const bestRank = best ? ATTENTION_RANK[best] : 0;
    return rank > bestRank ? (agent.status as Attention) : best;
  }, null);
}

export function offPageAttentionCount(
  agents: Agent[],
  page: number,
  pageSize = PAGE_SIZE,
): number {
  return agents.filter(
    (agent, index) =>
      isOffPage(index, page, pageSize) && (ATTENTION_RANK[agent.status] ?? 0) > 0,
  ).length;
}
