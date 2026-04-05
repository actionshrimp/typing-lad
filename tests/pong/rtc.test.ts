/**
 * Real WebRTC integration tests — HeadlessPongPeer + RtcPipe.
 * Validates transport layer using actual DataChannels via node-datachannel.
 */

import { describe, it, expect, afterEach } from "vitest";
import { HeadlessPongPeer, SERVE_PAUSE, WIN_SCORE } from "./headless-peer";
import { RtcPipe } from "./message-pipe";
import type { PeerMessage } from "../../packages/web/src/pong/protocol";

let pipe: RtcPipe | null = null;

afterEach(() => {
  pipe?.dispose();
  pipe = null;
});

async function makePipe(serveAngle = 0) {
  const host = new HeadlessPongPeer({ side: "left", serveAngle });
  const client = new HeadlessPongPeer({ side: "right", serveAngle });
  pipe = new RtcPipe(host, client);
  await pipe.connect();
  return pipe;
}

async function doHandshake(p: RtcPipe) {
  p.host.sendHello();
  await p.flush();
  // Client processes hello (queues messages, tick drains them)
  p.client.tick(0);

  p.client.sendHello();
  await p.flush();
  // Host processes hello
  p.host.tick(0);
}

async function advancePastServe(p: RtcPipe) {
  await p.step(SERVE_PAUSE + 0.01);
  await p.step(0);
}

describe("RTC DataChannel", () => {
  it("connection establishes successfully", async () => {
    const p = await makePipe();
    expect(p.host).toBeDefined();
    expect(p.client).toBeDefined();
  });

  it("hello with nested word arrays survives JSON round-trip", async () => {
    const p = await makePipe();

    p.host.sendHello();
    await p.flush();
    // Process the hello on client
    p.client.tick(0);

    expect(p.client.opponentWords.length).toBe(p.host.words.length);
    for (let i = 0; i < p.host.words.length; i++) {
      expect(p.client.opponentWords[i].word).toBe(p.host.words[i].word);
      expect(p.client.opponentWords[i].yPos).toBeCloseTo(
        p.host.words[i].yPos,
        5,
      );
    }
  });

  it("hit/serve message fields preserved through RTC", async () => {
    const p = await makePipe(0);
    await doHandshake(p);
    await advancePastServe(p);

    // Advance host to get a paddle hit
    for (let i = 0; i < 100; i++) {
      await p.step(0.05);
      if (p.host.rallyHits > 0) break;
    }

    expect(p.host.rallyHits).toBeGreaterThanOrEqual(1);

    // Process hit on client
    for (let i = 0; i < 20; i++) {
      await p.step(0.05);
    }

    expect(p.client.rallyHits).toBeGreaterThanOrEqual(1);
  });

  it("message ordering preserved (rapid burst)", async () => {
    const p = await makePipe();

    // Send a rapid burst of hello messages from host
    for (let i = 0; i < 10; i++) {
      p.host.sendHello();
    }
    await p.flush();

    // Process all received messages on client
    p.client.tick(0);

    // The last hello should have set opponent words
    expect(p.client.opponentWords.length).toBeGreaterThan(0);
    // Words should match host's words exactly
    expect(p.client.opponentWords[0].word).toBe(p.host.words[0].word);
  });

  it("full game plays to completion over RTC", async () => {
    const p = await makePipe(0);
    await doHandshake(p);
    await advancePastServe(p);

    // Use large dt and periodically force misses
    for (let i = 0; i < 500; i++) {
      if (i % 50 === 0) {
        p.client.completeWord(0);
        await p.flush();
      }
      await p.step(0.5);
      if (p.host.gameOver) break;
    }

    expect(p.host.gameOver).toBe(true);
    expect(
      p.host.leftScore >= WIN_SCORE || p.host.rightScore >= WIN_SCORE,
    ).toBe(true);

    // Sync final state to client
    await p.step(0);
    await p.step(SERVE_PAUSE + 0.1);
    await p.step(0);

    // Both agree on outcome
    const hostLeftWon = p.host.leftScore >= WIN_SCORE;
    const clientLeftWon = p.client.leftScore >= WIN_SCORE;
    expect(hostLeftWon).toBe(clientLeftWon);
  }, 30000);
});
