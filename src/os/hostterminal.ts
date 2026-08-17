// src/os/hostterminal.ts
//
// Works out which terminal app — and which tab of it — herdr is currently displayed in,
// by inspecting the attached herdr client process rather than asking the user to
// configure it. The client is the process the user typed `herdr` into, so the terminal
// session it was launched from *is* the one herdr is on screen in.
//
// Everything here reads the environment a process was **exec'd with** (what
// `ps eww` reports). That matters: variables a shell exports after exec are invisible,
// which is why Warp's own tab shells (`-zsh -g --no_rcs`) look empty while a `herdr`
// launched from one of them carries the full set.
import { execFile } from "node:child_process";

export type RunFn = (cmd: string, args: string[]) => Promise<string>;

// Absolute path so the call survives Stream Deck's minimal launch PATH.
const PS = "/bin/ps";

// What we can learn about herdr's host terminal. `focusUrl` is the valuable one: opening
// it raises the app *and* selects herdr's exact tab. `bundleId` only gets us the app.
export type HostTerminal = { focusUrl?: string; bundleId?: string };

export type HostTerminalResolver = { resolve(): Promise<HostTerminal | null> };

const defaultRun: RunFn = (cmd, args) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 4000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args.join(" ")} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });

// Only accept Warp's own scheme (`warp://`, `warppreview://`) so a stray environment
// value can never turn into an arbitrary `open` argument — a path or a leading dash
// would otherwise be handed straight to LaunchServices.
const FOCUS_URL = /(?:^|\s)WARP_FOCUS_URL=(warp[a-z]*:\/\/[^\s]+)/;
const BUNDLE_ID = /(?:^|\s)__CFBundleIdentifier=([A-Za-z0-9][A-Za-z0-9.-]*)/;

// Pull the interesting variables out of `ps eww` output. Deliberately two targeted
// regexes rather than a general KEY=VALUE parse: ps separates entries with spaces, so
// values that themselves contain spaces are ambiguous — but a URL and a bundle id
// never do.
export function parseProcessEnv(psEnvOutput: string): HostTerminal {
  const host: HostTerminal = {};
  const url = FOCUS_URL.exec(psEnvOutput);
  if (url) host.focusUrl = url[1];
  const bundle = BUNDLE_ID.exec(psEnvOutput);
  if (bundle) host.bundleId = bundle[1];
  return host;
}

// `ps eww` prints the command line first and the environment after it. Split at the
// first KEY=VALUE so callers can inspect the arguments alone.
export function splitCommandLine(psEnvOutput: string): string {
  const env = /\s[A-Za-z_][A-Za-z0-9_]*=/.exec(psEnvOutput);
  return (env ? psEnvOutput.slice(0, env.index) : psEnvOutput).trim();
}

// Candidate herdr clients from `ps -Ao pid=,tty=,comm=`. Requiring a controlling
// terminal is what separates the client the user is looking at from the `herdr server`
// daemon and from the plugin's own short-lived `herdr agent list` calls — both of which
// run without a tty.
export function parseHerdrClientPids(psOutput: string): number[] {
  const pids: number[] = [];
  for (const line of psOutput.split("\n")) {
    const row = /^\s*(\d+)\s+(\S+)\s+(.+)$/.exec(line);
    if (!row) continue;
    const [, pid, tty, comm] = row;
    if (tty === "??") continue;
    // comm is a bare name for the client and a full path for the daemon; a process on
    // its way out shows up parenthesized as "(herdr)" and is filtered out by name.
    if (comm.trim().split("/").pop() !== "herdr") continue;
    pids.push(Number(pid));
  }
  return pids;
}

// Resolve herdr's host terminal, or null when it cannot be determined — an unattached
// (headless) herdr, a client attached over ssh, or an environment we are not allowed to
// read. Callers fall back to raising a configured app in that case.
//
// Not cached: two `ps` spawns per key press is nothing at human rates, and re-reading
// every time is what makes this follow herdr when it is reattached in another terminal.
export function createHostTerminalResolver(
  opts: { run?: RunFn; onWarn?: (message: string) => void } = {},
): HostTerminalResolver {
  const run = opts.run ?? defaultRun;
  const warn = opts.onWarn ?? ((): void => {});
  return {
    async resolve() {
      let listing: string;
      try {
        listing = await run(PS, ["-Ao", "pid=,tty=,comm="]);
      } catch (e) {
        warn(`host terminal: listing processes failed: ${String(e)}`);
        return null;
      }
      let appOnly: HostTerminal | null = null;
      for (const pid of parseHerdrClientPids(listing)) {
        let out: string;
        try {
          out = await run(PS, ["eww", "-o", "command=", "-p", String(pid)]);
        } catch (e) {
          warn(`host terminal: reading env of pid ${pid} failed: ${String(e)}`);
          continue;
        }
        // A `herdr server` running in the foreground has a tty too; it is not a client.
        if (splitCommandLine(out).split(/\s+/).includes("server")) continue;
        const host = parseProcessEnv(out);
        if (host.focusUrl) return host; // exact-tab focus beats any app-only answer
        if (host.bundleId && !appOnly) appOnly = host;
      }
      if (!appOnly) warn("host terminal: no attached herdr client found");
      return appOnly;
    },
  };
}
