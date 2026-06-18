// src/core/store.ts
import { normalize, visibleAgents, type Agent, type RawAgent } from "./agents";
import { clampPage, pageCount } from "./pagination";

export type StoreState = { agents: Agent[]; page: number };

export type AgentStore = {
  getState(): StoreState;
  subscribe(fn: (s: StoreState) => void): () => void;
  setPage(next: number): void;
  nextPage(): void;
  pollNow(): Promise<void>;
  start(intervalMs?: number): void;
  stop(): void;
};

export function createAgentStore(opts: {
  fetchAgents: () => Promise<RawAgent[]>;
  pageSize?: number;
}): AgentStore {
  const pageSize = opts.pageSize ?? 5;
  let state: StoreState = { agents: [], page: 0 };
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
    async pollNow() {
      if (inFlight) return;
      inFlight = true;
      try {
        const agents = visibleAgents(normalize(await opts.fetchAgents()));
        hasLastGood = true;
        failStreak = 0;
        set({ agents, page: clampPage(state.page, pageCount(agents.length, pageSize)) });
      } catch {
        failStreak += 1;
        if (!(failStreak === 1 && hasLastGood)) {
          hasLastGood = false;
          set({ agents: [], page: 0 });
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
