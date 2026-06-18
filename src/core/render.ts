// src/core/render.ts
import { presentation, type AgentStatus } from "./status";

export type KeyView = { label: string; status: AgentStatus } | null;

type PagerView = {
  page: number;
  total: number;
  attention: "blocked" | "done" | null;
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

// Wrap a label into up to maxLines lines of perLine chars; the last line is
// ellipsised if the text still overflows.
function wrapLabel(label: string, perLine: number, maxLines: number): string[] {
  const lines: string[] = [];
  let rest = label;
  while (rest.length > perLine && lines.length < maxLines - 1) {
    lines.push(rest.slice(0, perLine));
    rest = rest.slice(perLine);
  }
  if (rest.length > perLine) {
    rest = `${rest.slice(0, perLine - 1)}…`;
  }
  lines.push(rest);
  return lines;
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
  const lines = wrapLabel(view.label, 8, 3);
  const firstY = 100 - (lines.length - 1) * 16;
  const labelSvg = lines
    .map((line, i) => {
      const y = firstY + i * 32;
      // Stretch multi-char lines toward the key edges; leave short fragments centered.
      const fit = line.length >= 4 ? ` textLength="132" lengthAdjust="spacingAndGlyphs"` : "";
      return `<text x="72" y="${y}"${fit} font-family="sans-serif" font-size="30" fill="#fff" text-anchor="middle">${escapeXml(line)}</text>`;
    })
    .join("");
  return toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">` +
      `<rect width="144" height="144" rx="16" fill="${color}"/>` +
      `<text x="72" y="34" font-family="sans-serif" font-size="24" fill="#fff" text-anchor="middle">${glyph}</text>` +
      labelSvg +
      `</svg>`,
  );
}

export function renderPagerSvg(view: PagerView): string {
  const multi = view.total > 1;
  const bg = multi ? "#111827" : "#0a0a0a";
  const arrow = multi ? "#ffffff" : "#444444";
  const badge = view.total > 1 && view.attention ? presentation(view.attention) : null;
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
