import { test, expect } from "bun:test";
import { createSoundPlayer, type RunFn } from "./sound";

const recorder = (fail = false): { calls: string[][]; run: RunFn } => {
  const calls: string[][] = [];
  const run: RunFn = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (fail) throw new Error("boom");
    return "";
  };
  return { calls, run };
};

test("plays the file with afplay, by absolute path", async () => {
  const { calls, run } = recorder();
  await createSoundPlayer({ run }).play("/System/Library/Sounds/Glass.aiff");
  expect(calls).toEqual([["/usr/bin/afplay", "/System/Library/Sounds/Glass.aiff"]]);
});

// A sound is decoration; the notification it accompanies is the point.
test("a failed play is reported through onWarn, not thrown", async () => {
  const warnings: string[] = [];
  const { run } = recorder(true);
  await createSoundPlayer({ run, onWarn: (m) => warnings.push(m) }).play("/tmp/gone.aiff");
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("/tmp/gone.aiff");
});

test("a non-absolute path or a flag-like value is refused before afplay runs", async () => {
  const warnings: string[] = [];
  const { calls, run } = recorder();
  const player = createSoundPlayer({ run, onWarn: (m) => warnings.push(m) });
  await player.play("-l");
  await player.play("relative.aiff");
  expect(calls).toEqual([]);
  expect(warnings).toHaveLength(2);
});
