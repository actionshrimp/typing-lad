import { describe, it, expect, afterEach } from "vitest";
import { spawnTui, ENTER, ESCAPE, DOWN, type TuiProcess, createTempDataDir } from "./helpers.js";

describe("TUI e2e", () => {
  let proc: TuiProcess | null = null;

  afterEach(() => {
    if (proc) {
      proc.kill();
      proc = null;
    }
  });

  it("renders menu with logo and options", async () => {
    proc = spawnTui();
    await proc.waitForText("Practice");
    const output = proc.getOutput();
    expect(output).toContain("Practice");
    expect(output).toContain("Stats");
    expect(output).toContain("Quit");
  });

  it("starts practice mode and shows a word", async () => {
    proc = spawnTui();
    await proc.waitForText("Practice");
    proc.write(ENTER); // select Practice
    await proc.waitForText("Practice —");
    const output = proc.getOutput();
    expect(output).toContain("Level:");
    expect(output).toContain("0/20 words");
  });

  it("types a word correctly and advances", async () => {
    proc = spawnTui();
    await proc.waitForText("Practice");
    proc.write(ENTER);
    await proc.waitForText("0/20 words");

    // Extract the target word from output
    // The target word appears on its own line after the header
    const output = proc.getOutput();
    const word = extractTargetWord(output);
    if (word) {
      // Type the word
      for (const ch of word) {
        proc.write(ch);
        await sleep(50);
      }
      await proc.waitForText("1/20 words");
    }
  });

  it("resets on incorrect keystroke", async () => {
    proc = spawnTui();
    await proc.waitForText("Practice");
    proc.write(ENTER);
    await proc.waitForText("0/20 words");

    // Type a wrong character
    proc.write("~");
    await sleep(200);
    // The typed text should reset (still showing 0/20)
    const output = proc.getOutput();
    expect(output).toContain("0/20 words");
  });

  it("escape returns to menu from practice", async () => {
    proc = spawnTui();
    await proc.waitForText("Practice");
    proc.write(ENTER);
    await proc.waitForText("Practice —");
    proc.write(ESCAPE);
    await proc.waitForText("Session Complete!");
    proc.write(ENTER);
    await proc.waitForText("Practice");
  });

  it("navigates to stats view", async () => {
    proc = spawnTui();
    await proc.waitForText("Practice");
    proc.write(DOWN); // move to Stats
    proc.write(ENTER);
    await proc.waitForText("Statistics");
    const output = proc.getOutput();
    expect(output).toContain("Current Level");
    expect(output).toContain("Total Sessions");
  });

  it("quits from menu", async () => {
    proc = spawnTui();
    await proc.waitForText("Practice");
    proc.write(DOWN); // Stats
    proc.write(DOWN); // Quit
    proc.write(ENTER);
    // Process should exit
    await sleep(1000);
    // No error expected
  });
});

function extractTargetWord(output: string): string | null {
  // The target word is a line by itself, consisting of lowercase letters
  // It appears after "Level:" line
  const lines = output.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[a-z]+$/.test(trimmed) && trimmed.length >= 1 && trimmed.length <= 15) {
      return trimmed;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
