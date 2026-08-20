// src/herdr/config.test.ts
import { test, expect } from "bun:test";
import { parseAgentPanelSort, parseSoundEnabled, withSoundEnabled } from "./config";

// Real shape of ~/.config/herdr/config.toml
const CONFIG = `[theme]
name = "terminal"
auto_switch = false

[ui]
agent_panel_sort = "priority"

show_agent_labels_on_pane_borders = true
[ui.toast]
delivery = "off"
`;

test("reads agent_panel_sort out of a real config", () => {
  expect(parseAgentPanelSort(CONFIG)).toBe("priority");
});

test('"workspaces" is herdr\'s accepted alias for "spaces"', () => {
  expect(parseAgentPanelSort('[ui]\nagent_panel_sort = "workspaces"\n')).toBe("spaces");
  expect(parseAgentPanelSort('[ui]\nagent_panel_sort = "spaces"\n')).toBe("spaces");
});

// herdr ships its default config with every line commented out, so a naive substring search
// would read the commented example as the live value and silently pick the wrong order.
test("a commented-out line is not the value", () => {
  const commented = `[ui]
# Agent panel ordering: "spaces" (grouped by space) or "priority" (attention queue).
# "workspaces" is accepted as an alias for "spaces".
# agent_panel_sort = "priority"
`;
  expect(parseAgentPanelSort(commented)).toBe("spaces");
});

test("an uncommented value still wins when an example is commented above it", () => {
  const both = `[ui]
# agent_panel_sort = "spaces"
agent_panel_sort = "priority"
`;
  expect(parseAgentPanelSort(both)).toBe("priority");
});

test("missing, empty, or unrecognised falls back to herdr's default", () => {
  expect(parseAgentPanelSort("")).toBe("spaces");
  expect(parseAgentPanelSort("[ui]\nsidebar_width = 30\n")).toBe("spaces");
  expect(parseAgentPanelSort('[ui]\nagent_panel_sort = "nonsense"\n')).toBe("spaces");
});

test("tolerates whitespace and casing", () => {
  expect(parseAgentPanelSort('  agent_panel_sort   =   "PRIORITY"  ')).toBe("priority");
});

// --- [ui.sound] enabled -------------------------------------------------------------------

// herdr's own chime, which the deck cannot mute and therefore has to warn about.
test("sound is enabled by default, as herdr itself defaults it", () => {
  expect(parseSoundEnabled("")).toBe(true);
  expect(parseSoundEnabled("[ui.sound]\n# enabled = true\n")).toBe(true);
  expect(parseSoundEnabled('[ui]\nagent_panel_sort = "priority"\n')).toBe(true);
});

test("an explicit enabled = false is read", () => {
  expect(parseSoundEnabled("[ui.sound]\nenabled = false\n")).toBe(false);
  expect(parseSoundEnabled("[ui.sound]\n  enabled   =   false  # off\n")).toBe(false);
});

// `enabled` is a common key name; a bare line match would read some other table's setting.
test("only [ui.sound]'s own enabled counts", () => {
  const toml = "[update]\nenabled = false\n\n[ui.sound]\nenabled = true\n";
  expect(parseSoundEnabled(toml)).toBe(true);
  const other = "[ui.sound]\nrequest_path = \"x.mp3\"\n\n[update]\nenabled = false\n";
  expect(parseSoundEnabled(other)).toBe(true); // the false belongs to [update]
});

// --- writing it back ----------------------------------------------------------------------

test("an existing enabled line is replaced in place", () => {
  const out = withSoundEnabled("[ui.sound]\nenabled = true\nrequest_path = \"s.mp3\"\n", false);
  expect(out).toBe("[ui.sound]\nenabled = false\nrequest_path = \"s.mp3\"\n");
});

// herdr ships the line commented out; replacing it keeps the setting where the user looks for it.
test("a commented-out enabled line is replaced rather than duplicated", () => {
  const out = withSoundEnabled("[ui.sound]\n# enabled = true\n", false);
  expect(out).toBe("[ui.sound]\nenabled = false\n");
});

test("the key is inserted when the section exists without it", () => {
  const out = withSoundEnabled("[ui.sound]\nrequest_path = \"s.mp3\"\n", false);
  expect(out).toBe("[ui.sound]\nenabled = false\nrequest_path = \"s.mp3\"\n");
});

test("the section is appended when there is none", () => {
  const out = withSoundEnabled('[ui]\nagent_panel_sort = "priority"\n', false);
  expect(out).toContain('agent_panel_sort = "priority"');
  expect(out).toContain("[ui.sound]\nenabled = false\n");
});

// A key belonging to a later table must not be mistaken for [ui.sound]'s.
test("a later table's enabled is not hijacked", () => {
  const out = withSoundEnabled("[ui.sound]\nrequest_path = \"s.mp3\"\n\n[update]\nenabled = true\n", false);
  expect(out).toBe("[ui.sound]\nenabled = false\nrequest_path = \"s.mp3\"\n\n[update]\nenabled = true\n");
});

// The real file this was built against. Everything else in it must survive untouched.
test("rewriting a real config preserves every other line and comment", () => {
  const real = [
    "[theme]",
    'name = "terminal"',
    "auto_switch = false",
    "",
    "[ui]",
    'agent_panel_sort = "priority"',
    "",
    "show_agent_labels_on_pane_borders = true",
    "[ui.toast]",
    '# "system" routed through /usr/bin/osascript.',
    'delivery = "off"',
    "",
    "[ui.sound]",
    "enabled = true",
    "# Silence needs-attention (approval) prompts only.",
    'request_path = "sounds/silent.mp3"',
    "",
  ].join("\n");
  const out = withSoundEnabled(real, false);
  expect(out).toBe(real.replace("enabled = true", "enabled = false"));
  expect(parseSoundEnabled(out)).toBe(false);
  expect(parseAgentPanelSort(out)).toBe("priority"); // the other reader still works
});
