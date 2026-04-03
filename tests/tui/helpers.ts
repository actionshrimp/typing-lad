import * as nodePty from "node-pty";
import stripAnsi from "strip-ansi";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

export const ENTER = "\r";
export const ESCAPE = "\x1b";
export const UP = "\x1b[A";
export const DOWN = "\x1b[B";
export const BACKSPACE = "\x7f";

export interface TuiProcess {
  pty: nodePty.IPty;
  output: string;
  waitForText: (text: string, timeoutMs?: number) => Promise<void>;
  write: (data: string) => void;
  kill: () => void;
  getOutput: () => string;
}

export function createTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "typing-lad-test-"));
  return path.join(dir, "data.json");
}

export function spawnTui(dataPath?: string): TuiProcess {
  const dp = dataPath || createTempDataDir();
  const pty = nodePty.spawn("npx", ["tsx", "packages/tui/src/main.tsx"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: {
      ...process.env,
      TYPING_LAD_DATA_PATH: dp,
    },
  });

  let output = "";

  pty.onData((data: string) => {
    output += data;
  });

  const proc: TuiProcess = {
    pty,
    get output() { return output; },
    waitForText: (text: string, timeoutMs = 10000) => {
      return new Promise<void>((resolve, reject) => {
        const clean = stripAnsi(output);
        if (clean.includes(text)) {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          disposable.dispose();
          reject(new Error(`Timeout waiting for "${text}". Output:\n${stripAnsi(output)}`));
        }, timeoutMs);

        const disposable = pty.onData(() => {
          const clean = stripAnsi(output);
          if (clean.includes(text)) {
            clearTimeout(timeout);
            disposable.dispose();
            resolve();
          }
        });
      });
    },
    write: (data: string) => pty.write(data),
    kill: () => {
      try { pty.kill(); } catch {}
    },
    getOutput: () => stripAnsi(output),
  };

  return proc;
}
