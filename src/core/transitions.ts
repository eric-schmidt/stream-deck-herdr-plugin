// src/core/transitions.ts
import type { Agent } from "./agents";
import { isAttention } from "./status";

// Agents that just transitioned INTO an attention state (blocked/done) since the
// previous snapshot. A newly-appeared agent already in an attention state counts
// as a flip (its prior status is unknown / non-attention).
export function detectFlips(prev: Agent[], next: Agent[]): Agent[] {
  const before = new Map(prev.map((a) => [a.paneId, a.status]));
  return next.filter((a) => {
    if (!isAttention(a.status)) return false;
    const prevStatus = before.get(a.paneId);
    return prevStatus === undefined || !isAttention(prevStatus);
  });
}
