// src/herdr/client.ts
import { execFile } from "node:child_process";
import os from "node:os";
import type { RawAgent, RawWorkspace } from "../core/agents";

export type RunFn = (cmd: string, args: string[]) => Promise<string>;

// Stream Deck launches the plugin with a minimal PATH; ensure Homebrew is reachable.
// Prepend (not append): prefers the known-good Homebrew binary and avoids a leading
// colon when PATH is empty, which would otherwise put CWD first and let a malicious
// `herdr` in the working directory run ahead of the real one.
const PATH_EXTRA = `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.local/bin`;

const defaultRun: RunFn = (cmd, args) =>
  new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: `${PATH_EXTRA}:${process.env.PATH ?? ""}` };
    execFile(cmd, args, { timeout: 4000, maxBuffer: 1024 * 1024, env }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args.join(" ")} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });

export type NotifyOpts = { body?: string; sound?: "none" | "done" | "request" };

export type HerdrClient = {
  listAgents(): Promise<RawAgent[]>;
  // Key labels come from the space name, which `agent list` does not carry.
  listWorkspaces(): Promise<RawWorkspace[]>;
  focus(paneId: string): Promise<void>;
  notify(title: string, opts?: NotifyOpts): Promise<void>;
};

export function createHerdrClient(opts: { run?: RunFn; bin?: string } = {}): HerdrClient {
  const run = opts.run ?? defaultRun;
  const bin = opts.bin ?? "herdr";
  return {
    async listAgents() {
      const out = await run(bin, ["agent", "list"]);
      const parsed: unknown = JSON.parse(out);
      const agents = (parsed as { result?: { agents?: unknown } })?.result?.agents;
      if (!Array.isArray(agents)) throw new Error("unexpected `herdr agent list` shape");
      return agents as RawAgent[];
    },
    async listWorkspaces() {
      const out = await run(bin, ["workspace", "list"]);
      const parsed: unknown = JSON.parse(out);
      const workspaces = (parsed as { result?: { workspaces?: unknown } })?.result?.workspaces;
      if (!Array.isArray(workspaces)) throw new Error("unexpected `herdr workspace list` shape");
      return workspaces as RawWorkspace[];
    },
    async focus(paneId) {
      await run(bin, ["agent", "focus", paneId]);
    },
    async notify(title, opts = {}) {
      const args = ["notification", "show", title];
      if (opts.body !== undefined) args.push("--body", opts.body);
      if (opts.sound !== undefined) args.push("--sound", opts.sound);
      await run(bin, args);
    },
  };
}
