// src/core/store.ts
import { normalize, orderForDisplay, type Agent, type RawAgent } from "./agents";
import { clampPage, pageCount } from "./pagination";

export type StoreState = { agents: Agent[]; page: number };

export type AgentStore = {
  getState(): StoreState;
  subscribe(fn: (s: StoreState) => void): () => void;
  setPage(next: number): void;
  nextPage(): void;
  togglePin(paneId: string): void;
  isPinned(paneId: string): boolean;
  getPageSize(): number;
  setPageSize(n: number): void;
  pollNow(): Promise<void>;
  start(intervalMs?: number): void;
  stop(): void;
};

export function createAgentStore(opts: {
  fetchAgents: () => Promise<RawAgent[]>;
  pageSize?: number;
}): AgentStore {
  let pageSize = opts.pageSize ?? 5;
  let state: StoreState = { agents: [], page: 0 };
  // Full normalized list (includes idle) so pinned-idle agents can resurface;
  // `pinned` is paneIds in pin order (in-memory, reset on plugin restart).
  let allAgents: Agent[] = [];
  let pinned: string[] = [];
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
  // Re-derive the displayed list (pinned-first, idle hidden) from the current
  // raw list + pins, clamping the page to the new length.
  const recompute = () => {
    const agents = orderForDisplay(allAgents, pinned);
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
    getPageSize: () => pageSize,
    setPageSize(n) {
      pageSize = Math.max(1, Math.floor(n));
      recompute();
    },
    async pollNow() {
      if (inFlight) return;
      inFlight = true;
      try {
        allAgents = normalize(await opts.fetchAgents());
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
