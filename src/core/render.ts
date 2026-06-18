// src/core/render.ts
import { presentation, type AgentStatus } from "./status";

export type KeyView = { label: string; status: AgentStatus } | null;

type PagerView = {
  page: number;
  total: number;
  attention: "blocked" | "done" | "working" | null;
  count: number;
};

function toDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  const map: Record<string, string> = {
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  };
  return value.replace(/[<>&'"]/g, (c) => map[c] ?? c);
}

export function renderKeySvg(view: KeyView): string {
  if (!view) {
    return toDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">` +
        `<rect width="144" height="144" rx="16" fill="#000"/>` +
        `<text x="72" y="84" font-family="sans-serif" font-size="40" fill="#333" text-anchor="middle">·</text>` +
        `</svg>`,
    );
  }
  const { color, glyph } = presentation(view.status);
  return toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">` +
      `<rect width="144" height="144" rx="16" fill="${color}"/>` +
      `<text x="72" y="60" font-family="sans-serif" font-size="44" fill="#fff" text-anchor="middle">${glyph}</text>` +
      `<text x="72" y="108" font-family="sans-serif" font-size="20" fill="#fff" text-anchor="middle">${escapeXml(view.label)}</text>` +
      `</svg>`,
  );
}

export function renderPagerSvg(view: PagerView): string {
  const multi = view.total > 1;
  const bg = multi ? "#111827" : "#0a0a0a";
  const arrow = multi ? "#ffffff" : "#444444";
  const badge = view.attention ? presentation(view.attention) : null;
  const badgeSvg = badge
    ? `<circle cx="116" cy="28" r="22" fill="${badge.color}"/>` +
      `<text x="116" y="36" font-family="sans-serif" font-size="24" fill="#fff" text-anchor="middle">${view.count > 1 ? view.count : badge.glyph}</text>`
    : "";
  return toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">` +
      `<rect width="144" height="144" rx="16" fill="${bg}"/>` +
      `<text x="72" y="82" font-family="sans-serif" font-size="46" fill="${arrow}" text-anchor="middle">▶</text>` +
      `<text x="72" y="120" font-family="sans-serif" font-size="20" fill="#9ca3af" text-anchor="middle">${view.page + 1}/${view.total}</text>` +
      badgeSvg +
      `</svg>`,
  );
}
