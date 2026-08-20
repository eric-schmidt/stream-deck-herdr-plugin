// src/herdr/client.test.ts
import { test, expect } from "bun:test";
import { createHerdrClient, type RunFn } from "./client";
import fixture from "../../tests/fixtures/agent-list.json";

test("listAgents runs `herdr agent list` and returns the agents array", async () => {
  const calls: string[][] = [];
  const run: RunFn = async (cmd, args) => {
    calls.push([cmd, ...args]);
    return JSON.stringify(fixture);
  };
  const client = createHerdrClient({ run });
  const agents = await client.listAgents();
  expect(agents).toHaveLength(4);
  expect(calls[0]).toEqual(["herdr", "agent", "list"]);
});

// Real `herdr workspace list` output, trimmed to the fields the plugin reads.
const WORKSPACES = {
  id: "cli:workspace:list",
  result: {
    type: "workspace_list",
    workspaces: [
      { workspace_id: "w8", label: "Next.js Caching", number: 1, pane_count: 1 },
      { workspace_id: "w9", label: "[ExO] SDK Prerendering Issue", number: 2, pane_count: 1 },
    ],
  },
};

test("listWorkspaces runs `herdr workspace list` and returns the workspaces array", async () => {
  const calls: string[][] = [];
  const run: RunFn = async (cmd, args) => {
    calls.push([cmd, ...args]);
    return JSON.stringify(WORKSPACES);
  };
  const client = createHerdrClient({ run });
  const workspaces = await client.listWorkspaces();
  expect(calls[0]).toEqual(["herdr", "workspace", "list"]);
  expect(workspaces.map((w) => w.label)).toEqual([
    "Next.js Caching",
    "[ExO] SDK Prerendering Issue",
  ]);
});

test("listWorkspaces throws on malformed shape", async () => {
  const run: RunFn = async () => JSON.stringify({ result: {} });
  const client = createHerdrClient({ run });
  await expect(client.listWorkspaces()).rejects.toThrow();
});

test("listAgents throws on malformed shape", async () => {
  const run: RunFn = async () => JSON.stringify({ result: {} });
  const client = createHerdrClient({ run });
  await expect(client.listAgents()).rejects.toThrow();
});

test("focus runs `herdr agent focus <paneId>`", async () => {
  const calls: string[][] = [];
  const run: RunFn = async (cmd, args) => {
    calls.push([cmd, ...args]);
    return "";
  };
  const client = createHerdrClient({ run });
  await client.focus("wJ:p1");
  expect(calls[0]).toEqual(["herdr", "agent", "focus", "wJ:p1"]);
});

test("notify runs `herdr notification show` with body + sound", async () => {
  const calls: string[][] = [];
  const run: RunFn = async (cmd, args) => { calls.push([cmd, ...args]); return ""; };
  const client = createHerdrClient({ run });
  await client.notify("proj blocked", { body: "claude", sound: "request" });
  expect(calls[0]).toEqual(["herdr", "notification", "show", "proj blocked", "--body", "claude", "--sound", "request"]);
});
