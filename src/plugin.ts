// src/plugin.ts
import streamDeck from "@elgato/streamdeck";
import { createHerdrClient } from "./herdr/client";
import { createHerdrConfig } from "./herdr/config";
import { createTerminalActivator, parseTerminalTab, TAB_UNSET } from "./os/terminal";
import { createSoundPlayer } from "./os/sound";
import { createHostTerminalResolver } from "./os/hostterminal";
import { createAgentStore } from "./core/store";
import { AgentSlotAction } from "./actions/slot";
import { PagerAction } from "./actions/pager";
import { createHerdrEvents } from "./herdr/events";
import { detectFlips } from "./core/transitions";
import { labelFor } from "./core/agents";
import { soundPathFor, hasDeckSound, parseSoundConfig, DEFAULT_SOUND_CONFIG } from "./core/sounds";
import type { Agent } from "./core/agents";

streamDeck.logger.setLevel("info");

const herdr = createHerdrClient();
// The host terminal is discovered from the attached herdr client, so neither env var is
// normally needed; both are overrides. Setting HERDR_DECK_TERMINAL_APP skips discovery
// (and with it exact-tab focusing), HERDR_DECK_TERMINAL_TAB opts into a Cmd-N keystroke.
const terminalApp = process.env.HERDR_DECK_TERMINAL_APP;
const terminalTab = parseTerminalTab(process.env.HERDR_DECK_TERMINAL_TAB);
// Say so when an override is in play. These variables are inherited from whatever
// launched the Stream Deck app, so a stale value can silently defeat discovery — and
// without a log line the only way to notice is to inspect process environments.
if (terminalApp !== undefined) {
  streamDeck.logger.info(
    `host terminal: HERDR_DECK_TERMINAL_APP=${terminalApp} overrides discovery (no exact-tab focus)`,
  );
}
if (terminalTab !== TAB_UNSET) {
  streamDeck.logger.info(`host terminal: HERDR_DECK_TERMINAL_TAB=${terminalTab} keystroke enabled`);
}
const terminal = createTerminalActivator({
  resolver: createHostTerminalResolver({ onWarn: (m) => streamDeck.logger.info(m) }),
  app: terminalApp,
  tab: terminalTab,
});
const store = createAgentStore({
  fetchAgents: () => herdr.listAgents(),
  fetchWorkspaces: () => herdr.listWorkspaces(),
});

// The deck mirrors herdr's agent panel, which can be ordered two ways, so the plugin has to
// follow whichever `[ui] agent_panel_sort` is set to. Re-read alongside each refresh rather
// than once at startup: `herdr server reload-config` can change it while the plugin runs,
// and `setSortMode` no-ops unless the value actually changed.
const herdrConfig = createHerdrConfig({
  onWarn: (m) => streamDeck.logger.info(m),
  reload: () => herdr.reloadConfig(),
});
const syncSortMode = async (): Promise<void> => store.setSortMode(await herdrConfig.agentPanelSort());

// Notification sounds live in the plugin's *global* settings, not on a key: notifications
// fire from the store subscription below, and keys are positional, so a per-key sound would
// follow the deck position rather than the agent. The Agent Slot inspector edits them only
// because Stream Deck has no global property inspector. See ADR 0003.
const player = createSoundPlayer({ onWarn: (m) => streamDeck.logger.info(m) });
let soundConfig = DEFAULT_SOUND_CONFIG;
streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
  soundConfig = parseSoundConfig(ev.settings);
  void publishSoundState();
});

// herdr chimes on state change all by itself, from a source the plugin cannot mute. When the
// deck is also making a sound the user hears both — the bug that prompted ADR 0003 — so the
// inspector is told, and offers to turn herdr's chime off.
let warnedAboutClash = false;
async function publishSoundState(): Promise<void> {
  const herdrSoundEnabled = await herdrConfig.soundEnabled();
  const deckSoundConfigured = hasDeckSound(soundConfig);
  if (herdrSoundEnabled && deckSoundConfigured && !warnedAboutClash) {
    warnedAboutClash = true;
    streamDeck.logger.info(
      "sound: herdr's own [ui.sound] chime is enabled as well as a deck sound — both will play. " +
        "Turn it off from the Agent Slot inspector, or set [ui.sound] enabled = false in " +
        "~/.config/herdr/config.toml.",
    );
  }
  // No-ops unless an inspector is actually open.
  await streamDeck.ui.sendToPropertyInspector({
    event: "soundState",
    herdrSoundEnabled,
    deckSoundConfigured,
  });
}

// Recompute when an inspector opens, so the notice reflects herdr's config as it is now rather
// than as it was at startup.
streamDeck.ui.onDidAppear(() => void publishSoundState());

// The inspector's "turn off herdr's sounds" button. An explicit click is the approval — this
// edits the user's own config file, so it must never run as a side effect of anything else.
streamDeck.ui.onSendToPlugin(async (ev) => {
  if ((ev.payload as { event?: string })?.event !== "disableHerdrSound") return;
  try {
    const backup = await herdrConfig.setSoundEnabled(false);
    streamDeck.logger.info(`sound: disabled herdr's [ui.sound]; backup at ${backup}`);
    warnedAboutClash = false;
  } catch (e) {
    streamDeck.logger.error(`sound: could not disable herdr's [ui.sound]: ${String(e)}`);
  }
  await publishSoundState();
});

const slot = new AgentSlotAction(store, herdr, terminal);
const pager = new PagerAction(store, herdr, terminal);

let prevAgents: Agent[] | null = null;

store.subscribe((s) => {
  slot.renderAll();
  pager.renderAll();

  if (prevAgents === null) { prevAgents = s.agents; return; } // prime, no alert on first snapshot
  const flips = detectFlips(prevAgents, s.agents);
  prevAgents = s.agents;
  for (const a of flips) {
    // Always `--sound none`: herdr already chimes on state change by itself, so asking for a
    // notification sound on top of that is a second herdr sound. The toast still shows for
    // anyone who has `[ui.toast]` on; only the audio is the deck's. See ADR 0003.
    const playPath = soundPathFor(a.status, soundConfig);
    void herdr.notify(`${labelFor(a, s.agents)} ${a.status}`, { body: a.name, sound: "none" });
    if (playPath !== null) void player.play(playPath);
    slot.flash(a.paneId);
  }
});

// Debounce refreshes so a burst of socket events causes at most one poll.
let pending: ReturnType<typeof setTimeout> | null = null;
const refresh = (): void => {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    void syncSortMode();
    void store.pollNow();
  }, 150);
};

const events = createHerdrEvents({ onChange: refresh });

streamDeck.actions.registerAction(slot);
streamDeck.actions.registerAction(pager);

streamDeck.connect();
// After connect: this is a request/response round trip, so it needs the connection. The
// listener above then keeps it current as the inspector writes.
void streamDeck.settings.getGlobalSettings().then((g) => {
  soundConfig = parseSoundConfig(g);
  return publishSoundState();
});
void syncSortMode();
store.start(3000); // safety net; socket events drive the fast path
setInterval(() => void syncSortMode(), 3000); // picks up `herdr server reload-config`
events.start();
