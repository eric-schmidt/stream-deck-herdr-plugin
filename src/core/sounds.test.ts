import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import {
  parseSoundChoice,
  parseSoundConfig,
  soundPathFor,
  hasDeckSound,
  isPlayablePath,
  DEFAULT_SOUND_CONFIG,
  SYSTEM_SOUNDS,
  SYSTEM_SOUND_DIR,
} from "./sounds";

// Silent by default so a fresh install never doubles up with herdr's own chime.
test("an unset config asks the deck for no sound at all", () => {
  expect(soundPathFor("blocked", DEFAULT_SOUND_CONFIG)).toBeNull();
  expect(soundPathFor("done", DEFAULT_SOUND_CONFIG)).toBeNull();
  expect(hasDeckSound(DEFAULT_SOUND_CONFIG)).toBe(false);
});

test("a system sound resolves to its file under /System/Library/Sounds", () => {
  const config = parseSoundConfig({ soundBlocked: "system:Glass", soundDone: "system:Tink" });
  expect(soundPathFor("blocked", config)).toBe(`${SYSTEM_SOUND_DIR}/Glass.aiff`);
  expect(soundPathFor("done", config)).toBe(`${SYSTEM_SOUND_DIR}/Tink.aiff`);
  expect(hasDeckSound(config)).toBe(true);
});

test("a custom file is used when one has been picked", () => {
  const config = parseSoundConfig({ soundBlocked: "other", soundBlockedFile: "/tmp/alarm.aiff" });
  expect(soundPathFor("blocked", config)).toBe("/tmp/alarm.aiff");
});

test("each status reads its own setting", () => {
  const config = parseSoundConfig({ soundBlocked: "system:Basso", soundDone: "none" });
  expect(soundPathFor("blocked", config)).toBe(`${SYSTEM_SOUND_DIR}/Basso.aiff`);
  expect(soundPathFor("done", config)).toBeNull();
  expect(hasDeckSound(config)).toBe(true); // one is enough to clash with herdr's chime
});

// Choosing "Other…" is two steps in the inspector, and the file is picked second.
test("'Other' with no file yet is silent rather than guessing a sound", () => {
  expect(parseSoundChoice("other", undefined)).toEqual({ kind: "none" });
  expect(parseSoundChoice("other", "   ")).toEqual({ kind: "none" });
});

test("a system sound that macOS does not ship is refused", () => {
  expect(parseSoundChoice("system:Kazoo", undefined)).toEqual({ kind: "none" });
});

test("stored junk never reaches the player", () => {
  for (const value of [undefined, null, 42, "", "wat", "herdr", { a: 1 }]) {
    expect(parseSoundChoice(value, undefined)).toEqual({ kind: "none" });
  }
});

// The path becomes an argv entry for afplay, so a relative path or a leading dash must not
// survive parsing.
test("a custom path must be absolute and must not look like a flag", () => {
  expect(isPlayablePath("/System/Library/Sounds/Glass.aiff")).toBe(true);
  expect(isPlayablePath("sounds/ding.aiff")).toBe(false);
  expect(isPlayablePath("-l")).toBe(false);
  expect(parseSoundChoice("other", "-l")).toEqual({ kind: "none" });
  expect(parseSoundChoice("other", "relative.aiff")).toEqual({ kind: "none" });
});

// The inspector lists these names as static markup, since the bundled sdpi-components has no
// datasource support. This is what stops the two lists drifting apart.
test("the property inspector offers exactly the sounds this module accepts", () => {
  const html = readFileSync("dev.timvdhoorn.herdr-agents.sdPlugin/ui/slot.html", "utf8");
  const offered = [...html.matchAll(/value="system:([^"]+)"/g)].map((m) => m[1]);
  expect(offered.length).toBeGreaterThan(0);
  expect([...new Set(offered)].sort()).toEqual([...SYSTEM_SOUNDS].sort());
});

// The deck stopped asking herdr for notification sounds in ADR 0003; an inspector still
// offering "herdr default" would write a value nothing reads.
test("the property inspector no longer offers herdr's own sound as a choice", () => {
  const html = readFileSync("dev.timvdhoorn.herdr-agents.sdPlugin/ui/slot.html", "utf8");
  expect(html).not.toContain('value="herdr"');
});
