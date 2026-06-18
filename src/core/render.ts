// src/core/render.ts
import { presentation, type AgentStatus } from "./status";
import { AGENT_ICON } from "./agent-icons";

export type KeyView = { label: string; status: AgentStatus; agent: string; pinned: boolean } | null;

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

// Short 2-letter code per known herdr agent integration; falls back to the
// first two letters of any other agent name.
const AGENT_CODE: Record<string, string> = {
  claude: "CL", codex: "CX", copilot: "CP", cursor: "CU", devin: "DV",
  droid: "DR", kimi: "KM", opencode: "OC", kilo: "KL", hermes: "HM",
  qodercli: "QC", pi: "PI", omp: "OM",
};

function agentCode(name: string): string {
  const key = name.toLowerCase();
  return AGENT_CODE[key] ?? name.slice(0, 2).toUpperCase();
}

// Agent-type badge in the top-left corner: a monochrome white brand logo when
// one exists (Lobehub Icons), otherwise the 2-letter text code. Sits clear of
// the top-center status glyph.
const BADGE_X = 8;
const BADGE_Y = 8;
const BADGE_SIZE = 30;

function agentBadge(name: string): string {
  const icon = AGENT_ICON[name.toLowerCase()];
  if (icon) {
    const [minX, minY, w, h] = icon.vb.split(/\s+/).map(Number);
    const scale = BADGE_SIZE / Math.max(w, h);
    const transform = `translate(${BADGE_X} ${BADGE_Y}) scale(${scale}) translate(${-minX} ${-minY})`;
    return (
      `<g transform="${transform}" fill="#ffffff" fill-opacity="0.85" fill-rule="evenodd">` +
      icon.body +
      `</g>`
    );
  }
  return (
    `<text x="10" y="28" font-family="sans-serif" font-size="18" font-weight="bold" ` +
    `fill="#ffffff" fill-opacity="0.75" text-anchor="start">${escapeXml(agentCode(name))}</text>`
  );
}

export function renderKeySvg(view: KeyView): string {
  if (!view) {
    // Empty slot: fully black ("screen off"), no marker.
    return toDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">` +
        `<rect width="144" height="144" rx="16" fill="#000"/>` +
        `</svg>`,
    );
  }
  const { color, glyph } = presentation(view.status);
  const lines = wrapLabel(view.label, 8, 3);
  const firstY = 102 - (lines.length - 1) * 15;
  const labelSvg = lines
    .map((line, i) => {
      const y = firstY + i * 30;
      // Stretch multi-char lines almost to the key edges; leave short fragments centered.
      const fit = line.length >= 4 ? ` textLength="142" lengthAdjust="spacingAndGlyphs"` : "";
      return `<text x="72" y="${y}"${fit} font-family="sans-serif" font-size="26" fill="#fff" text-anchor="middle">${escapeXml(line)}</text>`;
    })
    .join("");
  const badge = agentBadge(view.agent);
  // Pushpin marker (round head + needle) in the top-right corner when pinned.
  const pin = view.pinned
    ? `<g fill="#ffffff" fill-opacity="0.92">` +
      `<circle cx="126" cy="15" r="7"/>` +
      `<path d="M126 20 L122 23 L126 33 L130 23 Z"/>` +
      `</g>`
    : "";
  return toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">` +
      `<rect width="144" height="144" rx="16" fill="${color}"/>` +
      `<text x="72" y="34" font-family="sans-serif" font-size="24" fill="#fff" text-anchor="middle">${glyph}</text>` +
      badge +
      pin +
      labelSvg +
      `</svg>`,
  );
}

export function renderAttentionSvg(opts: { count: number; attention: "blocked" | "done" | null }): string {
  const active = opts.count > 0 && opts.attention !== null;
  const bg = active ? presentation(opts.attention as "blocked" | "done").color : "#0a0a0a";
  const fg = active ? "#ffffff" : "#444444";
  return toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">` +
      `<rect width="144" height="144" rx="16" fill="${bg}"/>` +
      `<text x="72" y="74" font-family="sans-serif" font-size="52" fill="${fg}" text-anchor="middle">⇥</text>` +
      `<text x="72" y="116" font-family="sans-serif" font-size="22" fill="${fg}" text-anchor="middle">${opts.count}</text>` +
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
