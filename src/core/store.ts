// src/core/store.ts
import {
  normalize,
  sortForPanel,
  type Agent,
  type AgentPanelSort,
  type RawAgent,
  type RawWorkspace,
} from "./agents";
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
  // Mirrors herdr's `[ui] agent_panel_sort`; see src/herdr/config.ts.
  setSortMode(sort: AgentPanelSort): void;
  pollNow(): Promise<void>;
  start(intervalMs?: number): void;
  stop(): void;
};

export function createAgentStore(opts: {
  fetchAgents: () => Promise<RawAgent[]>;
  // Supplies the space names keys are labelled with. Optional and non-fatal: a label lookup
  // must never blank the deck, so a rejection degrades to cwd-based labels.
  fetchWorkspaces?: () => Promise<RawWorkspace[]>;
  pageSize?: number;
  sortMode?: AgentPanelSort;
}): AgentStore {
  // Inferred from the slot keys the user has placed, so it is unknown until one reports.
  let pageSize: number | null = opts.pageSize ?? null;
  let state: StoreState = { agents: [], page: 0 };
  let allAgents: Agent[] = [];
  let sortMode: AgentPanelSort = opts.sortMode ?? "spaces";
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
  // The deck mirrors herdr's agent panel: every agent, idle included, in the order that
  // panel shows them — so deck position N is herdr row N. Nothing is filtered; the only
  // reordering is whichever sort herdr itself is set to.
  const recompute = () => {
    const agents = sortForPanel(allAgents, sortMode);
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
    getPageSize: () => pageSize,
    setPageSize(n) {
      // Slot keys appear one at a time, so this is called repeatedly with the same value;
      // bail early rather than re-render every key on each no-op.
      const next = Math.max(1, Math.floor(n));
      if (next === pageSize) return;
      pageSize = next;
      recompute();
    },
    setSortMode(sort) {
      if (sort === sortMode) return; // polled on every refresh; only re-render on a change
      sortMode = sort;
      recompute();
    },
    async pollNow() {
      if (inFlight) return;
      inFlight = true;
      try {
        const [agents, workspaces] = await Promise.all([
          opts.fetchAgents(),
          opts.fetchWorkspaces?.().catch(() => [] as RawWorkspace[]) ?? [],
        ]);
        allAgents = normalize(agents, workspaces);
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
