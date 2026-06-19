import { test, expect } from "bun:test";
import { createTerminalActivator, DEFAULT_TERMINAL_APP, type RunFn } from "./terminal";

test("activate runs osascript to activate the configured app", async () => {
  const calls: string[][] = [];
  const run: RunFn = async (cmd, args) => {
    calls.push([cmd, ...args]);
    return "";
  };
  await createTerminalActivator({ run, app: "Ghostty" }).activate();
  expect(calls[0]).toEqual(["/usr/bin/osascript", "-e", 'tell application "Ghostty" to activate']);
});

test("defaults to iTerm", async () => {
  const calls: string[][] = [];
  const run: RunFn = async (cmd, args) => {
    calls.push([cmd, ...args]);
    return "";
  };
  await createTerminalActivator({ run }).activate();
  expect(calls[0][2]).toBe(`tell application "${DEFAULT_TERMINAL_APP}" to activate`);
  expect(DEFAULT_TERMINAL_APP).toBe("iTerm");
});
