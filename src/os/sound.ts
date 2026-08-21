// src/os/sound.ts
//
// Plays a notification sound. Used only when the user picked something herdr cannot produce:
// `herdr notification show --sound` offers just `none | done | request`, so a distinct sound
// per status has to come from here. See `src/core/sounds.ts` and ADR 0003.
import { execFile } from "node:child_process";
import { isPlayablePath } from "../core/sounds";

export type RunFn = (cmd: string, args: string[]) => Promise<string>;

// Absolute path so the call survives Stream Deck's minimal launch PATH, as with /usr/bin/open
// in ./terminal.ts.
const AFPLAY = "/usr/bin/afplay";

// afplay blocks for the length of the clip; a system sound is well under a second, and the
// timeout only exists so a pathological file cannot wedge a handle.
const TIMEOUT_MS = 10_000;

const defaultRun: RunFn = (cmd, args) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args.join(" ")} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });

export type SoundPlayer = { play(path: string): Promise<void> };

// Never throws. A sound that will not play must not take the notification down with it, the
// same way a failed terminal raise is logged and ignored in `src/actions/slot.ts`.
export function createSoundPlayer(
  opts: { run?: RunFn; onWarn?: (message: string) => void } = {},
): SoundPlayer {
  const run = opts.run ?? defaultRun;
  return {
    async play(path) {
      // Re-checked here, not just at parse time: `path` reaches afplay as an argument, so a
      // value like "-l" would be read as an option rather than a file.
      if (!isPlayablePath(path)) {
        opts.onWarn?.(`sound: refusing to play ${path} (not an absolute file path)`);
        return;
      }
      try {
        await run(AFPLAY, [path]);
      } catch (e) {
        opts.onWarn?.(`sound: ${path} failed to play: ${String(e)}`);
      }
    },
  };
}
