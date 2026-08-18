// src/core/store.ts
import { normalize, orderForDisplay, type Agent, type RawAgent } from "./agents";
import { clampPage, pageCount } from "./pagination";

export type StoreState = { agents: Agent[]; page: number };

// How long an agent remains visible after going idle (ms). In-memory only;
// resets when the plugin restarts.
const RECENT_IDLE_MS = 30 * 60 * 1000;

export type AgentStore = {
  getState(): StoreState;
  subscribe(fn: (s: StoreState) => void): () => void;
  setPage(next: number): void;
  nextPage(): void;
  togglePin(paneId: string): void;
  isPinned(paneId: string): boolean;
  isRecentlyIdle(paneId: string): boolean;
  pollNow(): Promise<void>;
  start(intervalMs?: number): void;
  stop(): void;
};

export function createAgentStore(opts: {
  fetchAgents: () => Promise<RawAgent[]>;
  pageSize?: number;
  recentIdleMs?: number;
}): AgentStore {
  const pageSize = opts.pageSize ?? 5;
  const recentIdleMs = opts.recentIdleMs ?? RECENT_IDLE_MS;
  let state: StoreState = { agents: [], page: 0 };
  // Full normalized list (includes idle) so pinned/recently-idle agents can resurface;
  // `pinned` is paneIds in pin order (in-memory, reset on plugin restart).
  let allAgents: Agent[] = [];
  let pinned: string[] = [];
  // paneId → timestamp when the agent last transitioned to idle
  const recentlyActive = new Map<string, number>();
  let hasLastGood = false;
  let failStreak = 0;
  let inFlight = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const subs = new Set<(s: StoreState) => void>();

  const emit = () => subs.forEach((fn) => fn(state));
  const set = (next: Partial<StoreState>) => {
    state = { ...state, ...next };
    emit();
  };

  const recentlyIdleSet = (now: number): Set<string> => {
    const cutoff = now - recentIdleMs;
    const out = new Set<string>();
    for (const [id, ts] of recentlyActive) {
      if (ts >= cutoff) out.add(id);
    }
    return out;
  };

  // Re-derive the displayed list from the current raw list + pins + recency,
  // clamping the page to the new length.
  const recompute = () => {
    const agents = orderForDisplay(allAgents, pinned, recentlyIdleSet(Date.now()));
    set({ agents, page: clampPage(state.page, pageCount(agents.length, pageSize)) });
  };

  const store: AgentStore = {
    getState: () => state,
    subscribe(fn) {
      subs.add(fn);
      fn(state);
      return () => {
        subs.delete(fn);
      };
    },
    setPage(next) {
      set({ page: clampPage(next, pageCount(state.agents.length, pageSize)) });
    },
    nextPage() {
      const pages = pageCount(state.agents.length, pageSize);
      set({ page: (state.page + 1) % pages });
    },
    togglePin(paneId) {
      pinned = pinned.includes(paneId)
        ? pinned.filter((id) => id !== paneId)
        : [...pinned, paneId];
      recompute();
    },
    isPinned: (paneId) => pinned.includes(paneId),
    isRecentlyIdle(paneId) {
      const ts = recentlyActive.get(paneId);
      return ts !== undefined && Date.now() - ts < recentIdleMs;
    },
    async pollNow() {
      if (inFlight) return;
      inFlight = true;
      try {
        const fresh = normalize(await opts.fetchAgents());
        const now = Date.now();
        const cutoff = now - recentIdleMs;
        // Detect non-idle → idle transitions and stamp them.
        const prevById = new Map(allAgents.map((a) => [a.paneId, a]));
        for (const a of fresh) {
          if (a.status === "idle") {
            const prev = prevById.get(a.paneId);
            if (prev && prev.status !== "idle") {
              recentlyActive.set(a.paneId, now);
            }
          }
        }
        // Prune stale entries so the map doesn't grow forever.
        for (const [id, ts] of recentlyActive) {
          if (ts < cutoff) recentlyActive.delete(id);
        }
        allAgents = fresh;
        hasLastGood = true;
        failStreak = 0;
        recompute();
      } catch {
        failStreak += 1;
        if (!(failStreak === 1 && hasLastGood)) {
          hasLastGood = false;
          allAgents = [];
          recompute();
        }
      } finally {
        inFlight = false;
      }
    },
    start(intervalMs = 1000) {
      if (timer) return;
      void store.pollNow();
      timer = setInterval(() => void store.pollNow(), intervalMs);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };

  return store;
}
