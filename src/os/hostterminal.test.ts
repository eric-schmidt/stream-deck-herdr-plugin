import { test, expect } from "bun:test";
import {
  createHostTerminalResolver,
  parseHerdrClientPids,
  parseProcessEnv,
  splitCommandLine,
  type RunFn,
} from "./hostterminal";

// Real `ps -Ao pid=,tty=,comm=` rows: an attached client, the daemon (no tty, full path),
// a plugin-spawned `herdr agent list` on its way out, and unrelated processes.
const PS_LISTING = [
  "19037 ??       /Users/eric.schmidt/.local/bin/herdr",
  "90599 ttys000  herdr",
  "30509 ??       (herdr)",
  "81776 ttys003  -zsh",
  "21337 ??       /Users/eric.schmidt/Library/Application Support/com.elgato.StreamDeck/NodeJS/24.13.1/node",
].join("\n");

// Real `ps eww -o command= -p <pid>` output, truncated after the interesting variables.
const ENV_WARP =
  "herdr __CFBundleIdentifier=dev.warp.Warp-Stable TMPDIR=/var/folders/tn/x/T/ " +
  "WARP_FOCUS_URL=warp://session/68883955331c4afeb113c29033192dfd TERM_PROGRAM=WarpTerminal SHELL=/bin/zsh";
const ENV_TERMINAL =
  "herdr __CFBundleIdentifier=com.apple.Terminal TMPDIR=/var/folders/tn/x/T/ " +
  "TERM_PROGRAM=Apple_Terminal TERM=xterm-256color SHELL=/bin/zsh";
const ENV_SERVER =
  "/Users/eric.schmidt/.local/bin/herdr server __CFBundleIdentifier=dev.warp.Warp-Stable " +
  "WARP_FOCUS_URL=warp://session/aaaaaaaaaaaaaaaa TERM_PROGRAM=WarpTerminal";

const recorder = (
  reply: (args: string[]) => string,
): { calls: string[][]; run: RunFn } => {
  const calls: string[][] = [];
  const run: RunFn = async (cmd, args) => {
    calls.push([cmd, ...args]);
    return reply(args);
  };
  return { calls, run };
};

test("parseHerdrClientPids keeps only herdr processes with a controlling terminal", () => {
  expect(parseHerdrClientPids(PS_LISTING)).toEqual([90599]);
});

test("parseHerdrClientPids returns nothing when no client is attached", () => {
  expect(parseHerdrClientPids("19037 ??       /Users/x/.local/bin/herdr")).toEqual([]);
  expect(parseHerdrClientPids("")).toEqual([]);
});

test("parseProcessEnv extracts the Warp focus URL and the bundle id", () => {
  expect(parseProcessEnv(ENV_WARP)).toEqual({
    focusUrl: "warp://session/68883955331c4afeb113c29033192dfd",
    bundleId: "dev.warp.Warp-Stable",
  });
});

test("parseProcessEnv yields only a bundle id outside Warp", () => {
  expect(parseProcessEnv(ENV_TERMINAL)).toEqual({ bundleId: "com.apple.Terminal" });
});

test("parseProcessEnv ignores focus URLs that are not Warp's scheme", () => {
  // A stray value must never reach `open` as a path or a flag.
  expect(parseProcessEnv("herdr WARP_FOCUS_URL=/etc/passwd").focusUrl).toBeUndefined();
  expect(parseProcessEnv("herdr WARP_FOCUS_URL=-nEditor").focusUrl).toBeUndefined();
  expect(parseProcessEnv("herdr WARP_FOCUS_URL=file:///tmp/x").focusUrl).toBeUndefined();
  expect(parseProcessEnv("herdr WARP_FOCUS_URL=warppreview://session/ab").focusUrl).toBe(
    "warppreview://session/ab",
  );
});

test("splitCommandLine stops at the first environment entry", () => {
  expect(splitCommandLine(ENV_SERVER)).toBe("/Users/eric.schmidt/.local/bin/herdr server");
  expect(splitCommandLine("herdr")).toBe("herdr");
});

test("resolve returns the focus URL of the attached client", async () => {
  const { calls, run } = recorder((args) => (args[0] === "-Ao" ? PS_LISTING : ENV_WARP));
  const host = await createHostTerminalResolver({ run }).resolve();
  expect(host).toEqual({
    focusUrl: "warp://session/68883955331c4afeb113c29033192dfd",
    bundleId: "dev.warp.Warp-Stable",
  });
  expect(calls[0]).toEqual(["/bin/ps", "-Ao", "pid=,tty=,comm="]);
  expect(calls[1]).toEqual(["/bin/ps", "eww", "-o", "command=", "-p", "90599"]);
});

test("resolve falls back to the bundle id when there is no focus URL", async () => {
  const { run } = recorder((args) => (args[0] === "-Ao" ? PS_LISTING : ENV_TERMINAL));
  expect(await createHostTerminalResolver({ run }).resolve()).toEqual({
    bundleId: "com.apple.Terminal",
  });
});

test("resolve skips a foreground herdr server", async () => {
  const listing = "19037 ttys004  herdr"; // a daemon started in the foreground has a tty too
  const warnings: string[] = [];
  const { run } = recorder((args) => (args[0] === "-Ao" ? listing : ENV_SERVER));
  const host = await createHostTerminalResolver({
    run,
    onWarn: (m) => warnings.push(m),
  }).resolve();
  expect(host).toBeNull();
  expect(warnings.join()).toContain("no attached herdr client");
});

test("resolve prefers a client with a focus URL over an app-only one", async () => {
  const listing = ["90599 ttys000  herdr", "90600 ttys001  herdr"].join("\n");
  const { run } = recorder((args) => {
    if (args[0] === "-Ao") return listing;
    return args[args.length - 1] === "90599" ? ENV_TERMINAL : ENV_WARP;
  });
  const host = await createHostTerminalResolver({ run }).resolve();
  expect(host?.focusUrl).toBe("warp://session/68883955331c4afeb113c29033192dfd");
});

test("resolve reports null and warns when the process listing fails", async () => {
  const warnings: string[] = [];
  const run: RunFn = async () => {
    throw new Error("ps: operation not permitted");
  };
  const host = await createHostTerminalResolver({ run, onWarn: (m) => warnings.push(m) }).resolve();
  expect(host).toBeNull();
  expect(warnings.join()).toContain("listing processes failed");
});

test("resolve keeps going when one process's env cannot be read", async () => {
  const listing = ["90599 ttys000  herdr", "90600 ttys001  herdr"].join("\n");
  const run: RunFn = async (_cmd, args) => {
    if (args[0] === "-Ao") return listing;
    if (args[args.length - 1] === "90599") throw new Error("ps: not permitted");
    return ENV_WARP;
  };
  const host = await createHostTerminalResolver({ run }).resolve();
  expect(host?.focusUrl).toBe("warp://session/68883955331c4afeb113c29033192dfd");
});
