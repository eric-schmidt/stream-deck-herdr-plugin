import net from "node:net";
import os from "node:os";
import path from "node:path";

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export function herdrSocketPath(): string {
  return process.env.HERDR_SOCKET_PATH ?? path.join(os.homedir(), ".config", "herdr", "herdr.sock");
}

// Pure: split an accumulated buffer + new chunk into complete lines and the
// remaining partial line. Keeps multi-chunk JSON lines intact.
export function feedLines(buffer: string, chunk: string): { lines: string[]; rest: string } {
  const parts = (buffer + chunk).split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.filter((l) => l.trim().length > 0), rest };
}

const SUBSCRIBE =
  JSON.stringify({
    id: "sd-sub",
    method: "events.subscribe",
    params: {
      subscriptions: [
        { type: "pane.agent_status_changed" },
        { type: "pane.created" },
        { type: "pane.closed" },
        { type: "pane.exited" },
        { type: "pane.agent_detected" },
      ],
    },
  }) + "\n";

export type EventsClient = { start(): void; stop(): void };

// Calls onChange() whenever herdr emits a subscribed event line (and once on the
// subscribe ack). Auto-reconnects with exponential backoff. Never throws.
export function createHerdrEvents(opts: { onChange: () => void; socketPath?: string }): EventsClient {
  const sockPath = opts.socketPath ?? herdrSocketPath();
  let stopped = false;
  let conn: net.Socket | null = null;
  let backoff = RECONNECT_MIN_MS;

  const connect = (): void => {
    if (stopped) return;
    const c = net.createConnection(sockPath);
    conn = c;
    let buffer = "";
    c.on("connect", () => {
      backoff = RECONNECT_MIN_MS;
      c.write(SUBSCRIBE);
    });
    c.on("data", (chunk: Buffer) => {
      const fed = feedLines(buffer, chunk.toString("utf8"));
      buffer = fed.rest;
      if (fed.lines.length > 0) opts.onChange();
    });
    const reconnect = (): void => {
      if (stopped) return;
      c.removeAllListeners();
      if (conn === c) conn = null;
      const wait = backoff;
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
      setTimeout(connect, wait);
    };
    c.on("error", reconnect);
    c.on("close", reconnect);
  };

  return {
    start: () => {
      stopped = false;
      connect();
    },
    stop: () => {
      stopped = true;
      conn?.destroy();
      conn = null;
    },
  };
}
