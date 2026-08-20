// src/core/store.ts
import { normalize, type Agent, type RawAgent } from "./agents";
import { clampPage, pageCount } from "./pagination";

export type StoreState = { agents: Agent[]; page: number };

export type AgentStore = {
  getState(): StoreState;
  subscribe(fn: (s: StoreState) => void): () => void;
  setPage(next: number): void;
  nextPage(): void;
  // null until an Agent Slot key reports its position; see `assignSlots` in ./slots.ts.
  getPageSize(): number | null;
  setPageSize(n: number): void;
  pollNow(): Promise<void>;
  start(intervalMs?: number): void;
  stop(): void;
};

export function createAgentStore(opts: {
  fetchAgents: () => Promise<RawAgent[]>;
  pageSize?: number;
}): AgentStore {
  // Inferred from the slot keys the user has placed, so it is unknown until one reports.
  let pageSize: number | null = opts.pageSize ?? null;
  let state: StoreState = { agents: [], page: 0 };
  let allAgents: Agent[] = [];
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
  // The deck mirrors herdr: every agent, in herdr's order, idle included. Nothing is
  // filtered or reordered here, so deck position N is herdr row N. Only the page is
  // re-clamped, in case the list shrank.
  const recompute = () => {
    set({
      agents: allAgents,
      page: clampPage(state.page, pageCount(allAgents.length, pageSize)),
    });
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
    getPageSize: () => pageSize,
    setPageSize(n) {
      // Slot keys appear one at a time, so this is called repeatedly with the same value;
      // bail early rather than re-render every key on each no-op.
      const next = Math.max(1, Math.floor(n));
      if (next === pageSize) return;
      pageSize = next;
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
