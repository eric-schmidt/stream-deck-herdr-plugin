import { test, expect } from "bun:test";
import {
  createTerminalActivator,
  parseTerminalTab,
  DEFAULT_TERMINAL_APP,
  TAB_UNSET,
  type RunFn,
} from "./terminal";
import type { HostTerminal, HostTerminalResolver } from "./hostterminal";

// Collects every invocation as [cmd, ...args] so tests can assert what was run.
const recorder = (fail?: (call: number) => boolean): { calls: string[][]; run: RunFn } => {
  const calls: string[][] = [];
  const run: RunFn = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (fail?.(calls.length)) throw new Error("boom");
    return "";
  };
  return { calls, run };
};

const resolverOf = (host: HostTerminal | null): HostTerminalResolver => ({
  resolve: async () => host,
});

const WARP_URL = "warp://session/68883955331c4afeb113c29033192dfd";

test("a resolved focus URL raises the app and lands on herdr's tab in one call", async () => {
  const { calls, run } = recorder();
  await createTerminalActivator({
    run,
    resolver: resolverOf({ focusUrl: WARP_URL, bundleId: "dev.warp.Warp-Stable" }),
  }).activate();
  expect(calls).toEqual([["/usr/bin/open", WARP_URL]]);
});

test("a focus URL suppresses the tab keystroke even when a tab is configured", async () => {
  // The URL already selected herdr's tab; a Cmd-N could only move us off it.
  const { calls, run } = recorder();
  await createTerminalActivator({
    run,
    tab: 1,
    resolver: resolverOf({ focusUrl: WARP_URL }),
  }).activate();
  expect(calls).toEqual([["/usr/bin/open", WARP_URL]]);
});

test("a resolved bundle id raises that app", async () => {
  const { calls, run } = recorder();
  await createTerminalActivator({
    run,
    resolver: resolverOf({ bundleId: "com.apple.Terminal" }),
  }).activate();
  expect(calls).toEqual([["/usr/bin/open", "-b", "com.apple.Terminal"]]);
});

test("an unresolvable host falls back to the default app", async () => {
  const { calls, run } = recorder();
  await createTerminalActivator({ run, resolver: resolverOf(null) }).activate();
  expect(calls).toEqual([["/usr/bin/open", "-a", DEFAULT_TERMINAL_APP]]);
  expect(DEFAULT_TERMINAL_APP).toBe("Warp");
});

test("no resolver at all still raises the default app", async () => {
  const { calls, run } = recorder();
  await createTerminalActivator({ run }).activate();
  expect(calls).toEqual([["/usr/bin/open", "-a", "Warp"]]);
});

test("an explicit app override wins and skips discovery entirely", async () => {
  const { calls, run } = recorder();
  let resolved = false;
  await createTerminalActivator({
    run,
    app: "Ghostty",
    resolver: {
      resolve: async () => {
        resolved = true;
        return { focusUrl: WARP_URL };
      },
    },
  }).activate();
  expect(calls).toEqual([["/usr/bin/open", "-a", "Ghostty"]]);
  expect(resolved).toBe(false);
});

test("tab switching is off unless a tab is configured", async () => {
  const { calls, run } = recorder();
  await createTerminalActivator({ run, app: "Terminal" }).activate();
  expect(calls).toHaveLength(1); // no osascript, so no Accessibility dependency
});

test("a configured tab sends Cmd-N once the overridden app is frontmost", async () => {
  const { calls, run } = recorder();
  await createTerminalActivator({ run, app: "Terminal", tab: 2 }).activate();
  expect(calls[0]).toEqual(["/usr/bin/open", "-a", "Terminal"]);
  expect(calls[1][0]).toBe("/usr/bin/osascript");
  expect(calls[1][2]).toContain('if frontmost of application "Terminal" then exit repeat');
  expect(calls[1][2]).toContain('keystroke "2" using command down');
});

test("the frontmost guard waits on the app that was actually raised", async () => {
  // Resolved by bundle id, so AppleScript has to address it by id rather than by name.
  const { calls, run } = recorder();
  await createTerminalActivator({
    run,
    tab: 1,
    resolver: resolverOf({ bundleId: "com.apple.Terminal" }),
  }).activate();
  expect(calls[1][2]).toContain('if frontmost of application id "com.apple.Terminal"');
});

test("a tab-select failure names the app, tab, and permission needed", async () => {
  const { calls, run } = recorder((call) => call === 2);
  const activate = createTerminalActivator({ run, app: "Warp", tab: 1 }).activate();
  await expect(activate).rejects.toThrow(/select tab 1 in Warp failed/);
  await expect(activate).rejects.toThrow(/Accessibility/);
  expect(calls).toHaveLength(2); // the raise still happened
});

test("parseTerminalTab is unset by default and accepts 1-8", () => {
  expect(parseTerminalTab(undefined)).toBe(TAB_UNSET);
  expect(TAB_UNSET).toBe(0);
  expect(parseTerminalTab("1")).toBe(1);
  expect(parseTerminalTab(" 3 ")).toBe(3);
  expect(parseTerminalTab("8")).toBe(8);
});

test("parseTerminalTab treats disabling and bogus values as unset", () => {
  for (const raw of ["", "0", "off", "none", "false", "9", "-1", "2.5", "abc"]) {
    expect(parseTerminalTab(raw)).toBe(TAB_UNSET);
  }
});
