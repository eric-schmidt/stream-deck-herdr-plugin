import { test, expect } from "bun:test";
import { feedLines, herdrSocketPath } from "./events";

test("feedLines returns complete lines and keeps the partial remainder", () => {
  const a = feedLines("", '{"a":1}\n{"b":2}\n{"c"');
  expect(a.lines).toEqual(['{"a":1}', '{"b":2}']);
  expect(a.rest).toBe('{"c"');
  const b = feedLines(a.rest, ':3}\n');
  expect(b.lines).toEqual(['{"c":3}']);
  expect(b.rest).toBe("");
});

test("feedLines drops blank lines", () => {
  expect(feedLines("", "\n\n").lines).toEqual([]);
});

test("herdrSocketPath honors HERDR_SOCKET_PATH then falls back to the default", () => {
  const prev = process.env.HERDR_SOCKET_PATH;
  process.env.HERDR_SOCKET_PATH = "/tmp/x.sock";
  expect(herdrSocketPath()).toBe("/tmp/x.sock");
  delete process.env.HERDR_SOCKET_PATH;
  expect(herdrSocketPath().endsWith("/.config/herdr/herdr.sock")).toBe(true);
  if (prev !== undefined) process.env.HERDR_SOCKET_PATH = prev;
});
