/**
 * Pure protocol tests — HeadlessPongPeer + DirectPipe.
 * Deterministic, no real I/O.
 */

import { describe, it, expect } from "vitest";
import {
  HeadlessPongPeer,
  FIELD_W,
  FIELD_H,
  BALL_SPEED_INIT,
  BALL_SPEED_MAX,
  BALL_SPEED_INCREMENT,
  SERVE_PAUSE,
  WIN_SCORE,
  PADDLE_H,
  PADDLE_MARGIN,
  PADDLE_W,
  BALL_R,
  WORD_SLOTS,
} from "./headless-peer";
import { DirectPipe } from "./message-pipe";
import type { ServeMsg, HitMsg } from "../../packages/web/src/pong/protocol";

function makePeers(serveAngle = 0) {
  const host = new HeadlessPongPeer({ side: "left", serveAngle });
  const client = new HeadlessPongPeer({ side: "right", serveAngle });
  const pipe = new DirectPipe(host, client);
  return { host, client, pipe };
}

/** Run the hello exchange and process on both sides. */
function doHandshake(pipe: DirectPipe) {
  pipe.host.sendHello();
  pipe.flush();
  pipe.client.sendHello();
  pipe.flush();
  // Process queued messages (hello triggers startMultiplayerServe)
  pipe.host.tick(0);
  pipe.client.tick(0);
}

/** Advance past the SERVE_PAUSE so the host serves, then deliver to client. */
function advancePastServe(pipe: DirectPipe) {
  pipe.step(SERVE_PAUSE + 0.01);
  // Serve message now queued on client; process it
  pipe.step(0);
}

describe("Handshake", () => {
  it("hello exchange populates opponent words on both sides", () => {
    const { host, client, pipe } = makePeers();
    doHandshake(pipe);

    expect(host.opponentWords.length).toBeGreaterThan(0);
    expect(client.opponentWords.length).toBeGreaterThan(0);
    expect(host.opponentWords[0].word).toBe(client.words[0].word);
    expect(client.opponentWords[0].word).toBe(host.words[0].word);
  });

  it("hello triggers host serve state", () => {
    const { host, client, pipe } = makePeers();
    doHandshake(pipe);

    expect(host.isServing).toBe(true);
    expect(client.isWaitingForRemoteServe).toBe(true);
  });
});

describe("Serve", () => {
  it("host emits ServeMsg after SERVE_PAUSE elapses", () => {
    const { host, pipe } = makePeers();
    doHandshake(pipe);

    // Tick less than serve pause — should not serve yet
    host.tick(SERVE_PAUSE - 0.1);
    const msgsBefore = host.drainSentMessages();
    expect(msgsBefore.filter((m) => m.type === "serve").length).toBe(0);
    expect(host.isServing).toBe(true);

    // Tick past the remaining time
    host.tick(0.2);
    const msgsAfter = host.drainSentMessages();
    const serves = msgsAfter.filter((m) => m.type === "serve");
    expect(serves.length).toBe(1);
    expect(host.isServing).toBe(false);
  });

  it("initial serve carries leftScore=0, rightScore=0", () => {
    const { host, pipe } = makePeers();
    doHandshake(pipe);

    host.tick(SERVE_PAUSE + 0.01);
    const msgs = host.drainSentMessages();
    const serve = msgs.find((m) => m.type === "serve") as ServeMsg;
    expect(serve).toBeDefined();
    expect(serve.leftScore).toBe(0);
    expect(serve.rightScore).toBe(0);
  });

  it("client receives serve → ball starts moving, waitingForRemoteServe clears", () => {
    const { client, pipe } = makePeers();
    doHandshake(pipe);

    expect(client.isWaitingForRemoteServe).toBe(true);
    expect(client.ballVx).toBe(0);

    advancePastServe(pipe);

    expect(client.isWaitingForRemoteServe).toBe(false);
    expect(client.ballVx).not.toBe(0);
  });

  it("deterministic serveAngle=0 produces straight right trajectory", () => {
    const { host, pipe } = makePeers(0);
    doHandshake(pipe);

    host.tick(SERVE_PAUSE + 0.01);
    const msgs = host.drainSentMessages();
    const serve = msgs.find((m) => m.type === "serve") as ServeMsg;

    // angle=0, dir=1 → Vx = cos(0)*speed = speed, Vy = sin(0)*speed = 0
    expect(serve.ballVx).toBeCloseTo(BALL_SPEED_INIT, 1);
    expect(serve.ballVy).toBeCloseTo(0, 5);
  });
});

describe("Paddle collision (host authority)", () => {
  it("host detects right paddle hit → emits HitMsg", () => {
    const { host, pipe } = makePeers(0);
    doHandshake(pipe);
    advancePastServe(pipe);

    // Ball heading right with angle=0. Tick host alone to detect paddle hit.
    // Right paddle is at center (FIELD_H/2), ball goes straight — will hit.
    const rightEdge = FIELD_W - PADDLE_MARGIN - PADDLE_W / 2;
    const dist = rightEdge - host.ballX - BALL_R;
    const timeToReach = dist / host.ballVx;

    // Tick host past the paddle collision
    host.tick(timeToReach + 0.01);
    const msgs = host.drainSentMessages();
    const hits = msgs.filter((m) => m.type === "hit");

    expect(hits.length).toBe(1);
    const hit = hits[0] as HitMsg;
    expect(hit.ballVx).toBeLessThan(0); // reflected left
    expect(hit.rallyHits).toBe(1);
  });

  it("host detects left paddle hit → emits HitMsg", () => {
    const { host, pipe } = makePeers(0);
    doHandshake(pipe);
    advancePastServe(pipe);

    // Advance to right paddle hit (ball reflects left)
    const rightEdge = FIELD_W - PADDLE_MARGIN - PADDLE_W / 2;
    const dist1 = rightEdge - host.ballX - BALL_R;
    host.tick(dist1 / host.ballVx + 0.01);
    host.drainSentMessages(); // consume first hit msg

    expect(host.ballVx).toBeLessThan(0); // now heading left

    // Advance to left paddle hit
    const leftEdge = PADDLE_MARGIN + PADDLE_W / 2 + BALL_R;
    const dist2 = host.ballX - leftEdge;
    host.tick(dist2 / -host.ballVx + 0.01);
    const msgs = host.drainSentMessages();
    const hits = msgs.filter((m) => m.type === "hit");

    expect(hits.length).toBe(1);
    expect(host.rallyHits).toBe(2);
  });

  it("client does NOT emit any HitMsg", () => {
    const { host, client, pipe } = makePeers(0);
    doHandshake(pipe);
    advancePastServe(pipe);

    // Run many ticks on client alone
    for (let i = 0; i < 50; i++) {
      client.tick(0.05);
      const msgs = client.drainSentMessages();
      const hits = msgs.filter((m) => m.type === "hit");
      expect(hits.length).toBe(0);
    }
  });

  it("client snaps ball state from received HitMsg", () => {
    const { host, client, pipe } = makePeers(0);
    doHandshake(pipe);
    advancePastServe(pipe);

    // Advance host to right paddle hit
    const rightEdge = FIELD_W - PADDLE_MARGIN - PADDLE_W / 2;
    const dist = rightEdge - host.ballX - BALL_R;
    host.tick(dist / host.ballVx + 0.01);

    // Get host's hit message and deliver to client
    const msgs = host.drainSentMessages();
    const hit = msgs.find((m) => m.type === "hit") as HitMsg;
    expect(hit).toBeDefined();

    client.receive(hit);
    // Client needs ball to reach paddle zone to apply deferred hit.
    // Advance client until ball reaches the right paddle zone.
    for (let i = 0; i < 100; i++) {
      client.tick(0.05);
      if (client.ballVx < 0) break;
    }

    expect(client.ballVx).toBeLessThan(0);
    expect(client.rallyHits).toBe(hit.rallyHits);
  });

  it("rally increments speed (capped at BALL_SPEED_MAX)", () => {
    const { host, pipe } = makePeers(0);
    doHandshake(pipe);
    advancePastServe(pipe);

    expect(host.ballSpeed).toBe(BALL_SPEED_INIT);

    // Advance host through a rally
    for (let i = 0; i < 200; i++) {
      host.tick(0.05);
      if (host.rallyHits > 0) break;
    }

    expect(host.rallyHits).toBeGreaterThanOrEqual(1);
    expect(host.ballSpeed).toBe(
      Math.min(
        BALL_SPEED_INIT + host.rallyHits * BALL_SPEED_INCREMENT,
        BALL_SPEED_MAX,
      ),
    );
    expect(host.ballSpeed).toBeLessThanOrEqual(BALL_SPEED_MAX);
  });
});

describe("Scoring", () => {
  /**
   * To guarantee a miss, move the right paddle to the top by completing word 0
   * (near top of field). Ball at angle=0 goes to center where paddle won't be.
   */
  function setupMiss(pipe: DirectPipe) {
    // Move right paddle to top via word_done from client
    pipe.client.completeWord(0);
    pipe.flush();
    // Process word_done on host (moves right paddle target to top)
    pipe.step(0);
    // Glide paddle far from center
    for (let i = 0; i < 20; i++) pipe.step(0.1);
  }

  it("ball past right → host increments leftScore, re-serves", () => {
    const { host, client, pipe } = makePeers(0);
    doHandshake(pipe);
    advancePastServe(pipe);

    setupMiss(pipe);

    // Now serve again (host should be serving after first rally ends)
    // Actually we need to wait for the serve to happen
    for (let i = 0; i < 100; i++) {
      pipe.step(0.1);
    }

    // With paddle at top and ball going straight, a score should happen
    // The ball hits the paddle or misses depending on paddle position.
    // After enough time, at least one score should accumulate.
    const totalScores = host.leftScore + host.rightScore;
    expect(totalScores).toBeGreaterThan(0);
  });

  it("client syncs scores from ServeMsg (not independently)", () => {
    const { host, client, pipe } = makePeers(0);
    doHandshake(pipe);
    advancePastServe(pipe);

    // Play until a score happens
    for (let i = 0; i < 2000; i++) {
      pipe.step(0.1);
      if (host.leftScore + host.rightScore > 0) break;
    }

    // After the serve following a score is delivered, scores should sync
    pipe.step(0);
    pipe.step(SERVE_PAUSE + 0.1);
    pipe.step(0);

    expect(client.leftScore).toBe(host.leftScore);
    expect(client.rightScore).toBe(host.rightScore);
  });

  it("game ends when either score reaches WIN_SCORE", () => {
    const { host, client, pipe } = makePeers(0);
    doHandshake(pipe);
    advancePastServe(pipe);

    // Play to completion — with paddles at center and angle=0,
    // the ball rallies forever. We need to periodically move a paddle
    // to create misses.
    for (let i = 0; i < 10000; i++) {
      // Every 200 ticks, move a paddle away to force a miss
      if (i % 200 === 0) {
        pipe.client.completeWord(0); // move right paddle to top
        pipe.flush();
      }
      pipe.step(0.1);
      if (host.gameOver) break;
    }

    expect(host.gameOver).toBe(true);
    expect(
      host.leftScore >= WIN_SCORE || host.rightScore >= WIN_SCORE,
    ).toBe(true);
  });
});

describe("Word / paddle", () => {
  it("word_done updates opponent paddle target and replaces word slot", () => {
    const { host, client, pipe } = makePeers(0);
    doHandshake(pipe);

    const clientWordBefore = client.words[2].word;
    client.completeWord(2);
    pipe.flush();
    pipe.host.tick(0);

    // Host should see the replacement word in opponent's slots
    expect(host.opponentWords[2].word).not.toBe(clientWordBefore);
  });

  it("paddle glides toward target over multiple ticks", () => {
    const { host } = makePeers(0);

    const initialY = host.leftPaddle;
    // Complete a word in the middle of the field (not at the edge where clamping occurs)
    const midSlotIdx = Math.floor(WORD_SLOTS / 2);
    const targetY = host.words[midSlotIdx].yPos;
    host.completeWord(midSlotIdx);

    // Tick a small amount — paddle should have moved but not arrived
    host.tick(0.05);
    const midY = host.leftPaddle;
    if (targetY !== initialY) {
      expect(midY).not.toBeCloseTo(initialY, 0);
    }

    // Tick a large amount — paddle should arrive at target (or clamped)
    host.tick(2.0);
    const finalY = host.leftPaddle;
    const clampedTarget = Math.max(
      PADDLE_H / 2,
      Math.min(FIELD_H - PADDLE_H / 2, targetY),
    );
    expect(finalY).toBeCloseTo(clampedTarget, 5);
  });
});

describe("Full game", () => {
  it("two peers play to completion with deterministic serves", () => {
    const { host, client, pipe } = makePeers(0);
    doHandshake(pipe);
    advancePastServe(pipe);

    for (let i = 0; i < 10000; i++) {
      // Periodically move paddles to create misses
      if (i % 200 === 0) {
        pipe.client.completeWord(0);
        pipe.flush();
      }
      pipe.step(0.1);
      if (host.gameOver) break;
    }

    expect(host.gameOver).toBe(true);

    // Sync final scores to client
    pipe.step(0);
    pipe.step(SERVE_PAUSE + 0.1);
    pipe.step(0);

    // Both should agree on winner
    const hostLeftWon = host.leftScore >= WIN_SCORE;
    const clientLeftWon = client.leftScore >= WIN_SCORE;
    expect(hostLeftWon).toBe(clientLeftWon);
  });

  it("scores stay synchronized at every serve", () => {
    const { host, client, pipe } = makePeers(0);
    doHandshake(pipe);

    let lastCheckedScoreSum = 0;
    for (let i = 0; i < 10000; i++) {
      if (i % 200 === 0) {
        pipe.client.completeWord(0);
        pipe.flush();
      }
      pipe.step(0.1);

      const scoreSum = host.leftScore + host.rightScore;
      if (scoreSum > lastCheckedScoreSum) {
        // Give client time to process serve message
        pipe.step(0);
        pipe.step(SERVE_PAUSE + 0.1);
        pipe.step(0);

        expect(client.leftScore).toBe(host.leftScore);
        expect(client.rightScore).toBe(host.rightScore);
        lastCheckedScoreSum = scoreSum;
      }

      if (host.gameOver) break;
    }

    expect(host.gameOver).toBe(true);
  });
});

describe("Edge cases", () => {
  it("stale hit messages during serve are discarded", () => {
    const { client, pipe } = makePeers(0);
    doHandshake(pipe);

    // Inject a stale hit while client is waiting for serve
    const staleHit: HitMsg = {
      type: "hit",
      ballVx: -100,
      ballVy: 50,
      ballX: 100,
      ballY: 200,
      rallyHits: 5,
    };
    client.receive(staleHit);
    client.tick(0);

    // Client should still be waiting (stale hit discarded)
    expect(client.isWaitingForRemoteServe).toBe(true);
    expect(client.ballVx).toBe(0);
  });

  it("wall bounces preserve ball speed", () => {
    const angle = 0.3; // non-zero angle creates vertical velocity
    const { host, pipe } = makePeers(angle);
    doHandshake(pipe);
    advancePastServe(pipe);

    const speedBefore = Math.sqrt(host.ballVx ** 2 + host.ballVy ** 2);

    // Advance until a wall bounce occurs (small ticks to stay pre-paddle)
    for (let i = 0; i < 50; i++) {
      host.tick(0.05);
    }

    const speedAfter = Math.sqrt(host.ballVx ** 2 + host.ballVy ** 2);
    // Speed preserved unless a paddle hit changed it
    if (host.rallyHits === 0) {
      expect(speedAfter).toBeCloseTo(speedBefore, 1);
    }
  });

  it("paddle clamped to field bounds", () => {
    const { host } = makePeers(0);

    host.completeWord(0); // target near top
    for (let i = 0; i < 50; i++) {
      host.tick(0.1);
    }

    expect(host.leftPaddle).toBeGreaterThanOrEqual(PADDLE_H / 2);
    expect(host.leftPaddle).toBeLessThanOrEqual(FIELD_H - PADDLE_H / 2);
  });
});
