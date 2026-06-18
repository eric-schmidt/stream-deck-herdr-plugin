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
