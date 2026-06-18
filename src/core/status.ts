// src/core/status.ts
export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

export type Presentation = { color: string; glyph: string };

const PRESENTATION: Record<AgentStatus, Presentation> = {
  working: { color: "#E8901E", glyph: "●" },
  blocked: { color: "#D13438", glyph: "▲" },
  done: { color: "#2B7FFF", glyph: "✓" },
  idle: { color: "#6B7280", glyph: "○" },
  unknown: { color: "#1F2937", glyph: "·" },
};

export const ATTENTION_RANK: Record<string, number> = {
  blocked: 3,
  done: 2,
  working: 1,
};

export function presentation(status: AgentStatus): Presentation {
  return PRESENTATION[status] ?? PRESENTATION.unknown;
}

export function isAttention(status: AgentStatus): boolean {
  return (ATTENTION_RANK[status] ?? 0) > 0;
}
