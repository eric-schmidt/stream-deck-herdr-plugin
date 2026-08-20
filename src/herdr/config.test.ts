// src/herdr/config.test.ts
import { test, expect } from "bun:test";
import { parseAgentPanelSort } from "./config";

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
