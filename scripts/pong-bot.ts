#!/usr/bin/env npx tsx
/**
 * Pong Bot CLI — connects to a multiplayer pong room as a real WebRTC peer.
 *
 * Usage:
 *   npx tsx scripts/pong-bot.ts <ROOM_CODE>
 *
 * The bot joins as Player 2 (right paddle) and plays automatically.
 * It implements the PeerJS signaling protocol directly over WebSocket,
 * using node-datachannel for WebRTC.
 */

import WebSocket from "ws";
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from "node-datachannel/polyfill";

// node-datachannel's RTCDataChannel type re-export is tricky, grab it from createDataChannel return
type DataChannel = ReturnType<InstanceType<typeof RTCPeerConnection>["createDataChannel"]>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ── Constants (must match game.ts) ────────────────────────────────

const FIELD_W = 800;
const FIELD_H = 500;
const PADDLE_H = 80;
const PADDLE_W = 14;
const PADDLE_MARGIN = 40;
const BALL_R = 8;
const BALL_SPEED_INIT = 175;
const BALL_SPEED_INCREMENT = 8;
const BALL_SPEED_MAX = 350;
const WORD_SLOTS = 12;

// ── Protocol types ────────────────────────────────────────────────

interface PeerMessage {
  type: string;
  [key: string]: unknown;
}

// PeerJS signaling message
interface SignalingMessage {
  type: string;
  payload?: Record<string, unknown>;
  src?: string;
  dst?: string;
}

// ICE candidate init for signaling
interface IceCandidateInit {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

// ── Word list ─────────────────────────────────────────────────────

const BOT_WORDS = [
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "day", "get", "has", "him", "his",
  "how", "its", "may", "new", "now", "old", "see", "way", "who", "did",
  "got", "let", "say", "she", "too", "use", "big", "end", "far", "few",
  "run", "set", "try", "ask", "own", "put", "red", "ten", "top", "yes",
  "add", "ago", "air", "boy", "cut", "dog", "eat", "fit", "hot", "job",
];

function pickWord(active: Set<string>): string {
  const available = BOT_WORDS.filter((w) => !active.has(w));
  if (available.length === 0)
    return BOT_WORDS[Math.floor(Math.random() * BOT_WORDS.length)];
  return available[Math.floor(Math.random() * available.length)];
}

// ── Bot brain (headless P2 simulation) ────────────────────────────

class PongBot {
  private send: (msg: PeerMessage) => void;
  private words: { word: string; yPos: number }[] = [];

  private ballX = FIELD_W / 2;
  private ballY = FIELD_H / 2;
  private ballVx = 0;
  private ballVy = 0;
  private ballSpeed = BALL_SPEED_INIT;
  private rallyHits = 0;

  private paddleY = FIELD_H / 2;
  private paddleTargetY = FIELD_H / 2;

  private waitingForServe = true;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private gameStarted = false;

  // Typing state: bot types one letter at a time
  private currentTarget: number = -1; // index into this.words
  private typedPrefix = "";
  private letterCooldown = 0;
  private readonly LETTER_INTERVAL = 0.12; // seconds between keystrokes
  private readonly THINK_PAUSE = 0.4; // pause before starting a new word

  constructor(send: (msg: PeerMessage) => void) {
    this.send = send;
    const active = new Set<string>();
    const spacing = FIELD_H / (WORD_SLOTS + 1);
    for (let i = 0; i < WORD_SLOTS; i++) {
      const word = pickWord(active);
      active.add(word);
      this.words.push({ word, yPos: spacing * (i + 1) });
    }
  }

  receive(msg: PeerMessage): void {
    switch (msg.type) {
      case "hello":
        log("Received hello from host, sending our words");
        this.send({
          type: "hello",
          words: this.words.map((w) => ({ word: w.word, yPosition: w.yPos })),
        });
        break;

      case "start":
        if (!this.gameStarted) {
          log("Game starting!");
          this.send({ type: "start" });
          this.gameStarted = true;
          this.waitingForServe = true;
          this.lastTick = performance.now();
          this.intervalId = setInterval(() => this.tick(), 16);
        }
        break;

      case "hit":
        // Host is authoritative for all paddle hits — snap ball state
        this.ballX = msg.ballX as number;
        this.ballY = msg.ballY as number;
        this.ballVx = msg.ballVx as number;
        this.ballVy = msg.ballVy as number;
        this.rallyHits = msg.rallyHits as number;
        this.ballSpeed = Math.min(
          BALL_SPEED_INIT + this.rallyHits * BALL_SPEED_INCREMENT,
          BALL_SPEED_MAX,
        );
        this.waitingForServe = false;
        log(`Received hit → ball at (${this.ballX.toFixed(0)}, ${this.ballY.toFixed(0)}) vx=${this.ballVx.toFixed(0)}`);
        break;

      case "serve":
        // Host is authoritative for scoring and serves
        this.applyServe(msg);
        break;

      case "typing":
      case "word_done":
        break;
    }
  }

  private applyServe(msg: PeerMessage): void {
    this.ballX = FIELD_W / 2;
    this.ballY = FIELD_H / 2;
    this.ballVx = msg.ballVx as number;
    this.ballVy = msg.ballVy as number;
    this.ballSpeed = BALL_SPEED_INIT;
    this.rallyHits = 0;
    this.waitingForServe = false;
    const leftScore = (msg.leftScore as number) ?? 0;
    const rightScore = (msg.rightScore as number) ?? 0;
    log(`Serve received → vx=${this.ballVx.toFixed(0)} vy=${this.ballVy.toFixed(0)} | Score: ${leftScore}-${rightScore}`);
  }

  dispose(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private tick(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.05);
    this.lastTick = now;
    this.updateBall(dt);
    this.updatePaddle(dt);
    this.updateTyping(dt);
  }

  /** Local ball simulation for prediction (word targeting).
   *  No hit detection or scoring — host is authoritative for all physics. */
  private updateBall(dt: number): void {
    if (this.waitingForServe) return;

    let remaining = dt;
    for (let step = 0; step < 4 && remaining > 0; step++) {
      const stepDt = remaining;
      const nx = this.ballX + this.ballVx * stepDt;
      const ny = this.ballY + this.ballVy * stepDt;

      if (ny - BALL_R < 0) {
        const t = (this.ballY - BALL_R) / -this.ballVy;
        this.ballX += this.ballVx * t;
        this.ballY = BALL_R;
        this.ballVy = -this.ballVy;
        remaining -= t;
        continue;
      }
      if (ny + BALL_R > FIELD_H) {
        const t = (FIELD_H - BALL_R - this.ballY) / this.ballVy;
        this.ballX += this.ballVx * t;
        this.ballY = FIELD_H - BALL_R;
        this.ballVy = -this.ballVy;
        remaining -= t;
        continue;
      }

      this.ballX = nx;
      this.ballY = ny;
      remaining = 0;
    }

    // Ball escaped field → freeze and wait for host's serve
    if (this.ballX < -BALL_R * 2 || this.ballX > FIELD_W + BALL_R * 2) {
      this.ballX = FIELD_W / 2;
      this.ballY = FIELD_H / 2;
      this.ballVx = 0;
      this.ballVy = 0;
      this.waitingForServe = true;
    }
  }

  private updatePaddle(dt: number): void {
    const diff = this.paddleTargetY - this.paddleY;
    const maxMove = 500 * dt;
    if (Math.abs(diff) <= maxMove) this.paddleY = this.paddleTargetY;
    else this.paddleY += Math.sign(diff) * maxMove;
    this.paddleY = Math.max(PADDLE_H / 2, Math.min(FIELD_H - PADDLE_H / 2, this.paddleY));
  }

  private pickTarget(): number {
    let targetY = FIELD_H / 2;
    if (this.ballVx > 0 && !this.waitingForServe) {
      const dx = FIELD_W - PADDLE_MARGIN - this.ballX;
      const timeToArrive = dx / this.ballVx;
      targetY = this.ballY + this.ballVy * timeToArrive;
      for (let i = 0; i < 10; i++) {
        if (targetY < 0) targetY = -targetY;
        else if (targetY > FIELD_H) targetY = 2 * FIELD_H - targetY;
        else break;
      }
      targetY = Math.max(PADDLE_H / 2, Math.min(FIELD_H - PADDLE_H / 2, targetY));
    }

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.words.length; i++) {
      const dist = Math.abs(this.words[i].yPos - targetY);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  private updateTyping(dt: number): void {
    this.letterCooldown -= dt;
    if (this.letterCooldown > 0) return;

    // Pick a new target word if we don't have one
    if (this.currentTarget < 0) {
      this.currentTarget = this.pickTarget();
      this.typedPrefix = "";
      this.paddleTargetY = this.words[this.currentTarget].yPos;
      this.letterCooldown = this.THINK_PAUSE;
      return;
    }

    const slot = this.words[this.currentTarget];

    // Type next letter
    this.typedPrefix += slot.word[this.typedPrefix.length];

    // Send typing progress
    this.send({
      type: "typing",
      targetIds: [this.currentTarget],
      typedPrefix: this.typedPrefix,
    });

    // Word complete?
    if (this.typedPrefix.length >= slot.word.length) {
      const completedWord = slot.word;
      const active = new Set(this.words.map((w) => w.word));
      const newWord = pickWord(active);
      this.words[this.currentTarget] = { word: newWord, yPos: slot.yPos };

      this.send({
        type: "word_done",
        slotIndex: this.currentTarget,
        newWord,
        paddleTargetY: slot.yPos,
        word: completedWord,
        typed: completedWord,
        durationMs: this.typedPrefix.length * this.LETTER_INTERVAL * 1000,
      });

      this.currentTarget = -1;
      this.typedPrefix = "";
      this.letterCooldown = this.THINK_PAUSE;
    } else {
      this.letterCooldown = this.LETTER_INTERVAL * (0.8 + Math.random() * 0.4);
    }
  }
}

// ── PeerJS signaling (direct implementation) ──────────────────────

const PEERJS_HOST = "0.peerjs.com";
const PEERJS_PORT = 443;
const PEERJS_PATH = "/";
const PEERJS_KEY = "peerjs";
const PEER_PREFIX = "typing-lad-";

function randomToken(): string {
  return Math.random().toString(36).slice(2);
}

function log(msg: string): void {
  console.log(`[bot] ${msg}`);
}

/** Decode DataChannel message data to string (may arrive as string, ArrayBuffer, or Buffer). */
function decodeMessage(raw: string | ArrayBuffer | Buffer): string {
  if (typeof raw === "string") return raw;
  if (raw instanceof ArrayBuffer) return decoder.decode(raw);
  if (Buffer.isBuffer(raw)) return raw.toString("utf-8");
  return String(raw);
}

async function main() {
  const code = process.argv[2]?.toUpperCase();
  if (!code || code.length !== 4) {
    console.error("Usage: npx tsx scripts/pong-bot.ts <ROOM_CODE>");
    process.exit(1);
  }

  const hostPeerId = PEER_PREFIX + code;
  const myPeerId = PEER_PREFIX + code + "-bot-" + randomToken().slice(0, 4);
  const myToken = randomToken();
  const connectionId = "dc_" + randomToken().slice(0, 8);

  log(`Connecting to room ${code} (host peer: ${hostPeerId})`);

  // 1. Connect to PeerJS signaling server
  const wsUrl =
    `wss://${PEERJS_HOST}:${PEERJS_PORT}${PEERJS_PATH}peerjs?key=${PEERJS_KEY}` +
    `&id=${myPeerId}&token=${myToken}&version=1.5.5`;

  const ws = new WebSocket(wsUrl);

  let pc: InstanceType<typeof RTCPeerConnection> | null = null;
  let dc: DataChannel | null = null;
  let bot: PongBot | null = null;
  let remoteDescSet = false;
  const pendingCandidates: IceCandidateInit[] = [];

  function sendSignaling(data: SignalingMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  /** Send game message over DataChannel. Encodes as binary (Uint8Array) because
   *  PeerJS's json deserializer always runs TextDecoder.decode() on incoming data. */
  function sendData(msg: PeerMessage) {
    if (dc && dc.readyState === "open") {
      dc.send(encoder.encode(JSON.stringify(msg)));
    }
  }

  async function applyPendingCandidates() {
    while (pendingCandidates.length > 0) {
      const c = pendingCandidates.shift()!;
      try {
        await pc!.addIceCandidate(new RTCIceCandidate(c));
      } catch (err: unknown) {
        log(`Failed to apply queued candidate: ${err}`);
      }
    }
  }

  ws.on("open", () => {
    log("WebSocket connected to signaling server");
  });

  ws.on("message", async (raw) => {
    const msg: SignalingMessage = JSON.parse(raw.toString());

    switch (msg.type) {
      case "OPEN":
        log("Registered with signaling server");
        await initiateConnection();
        break;

      case "ANSWER": {
        const sdp = msg.payload!.sdp as RTCSessionDescriptionInit;
        log("Received ANSWER from host");
        try {
          await pc!.setRemoteDescription(new RTCSessionDescription(sdp));
          remoteDescSet = true;
          await applyPendingCandidates();
        } catch (err: unknown) {
          log(`Failed to set remote description: ${err}`);
        }
        break;
      }

      case "CANDIDATE": {
        const candidate = msg.payload!.candidate as IceCandidateInit | undefined;
        if (candidate) {
          if (!remoteDescSet) {
            pendingCandidates.push(candidate);
          } else {
            try {
              await pc!.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err: unknown) {
              log(`Failed to add ICE candidate: ${err}`);
            }
          }
        }
        break;
      }

      case "ERROR":
        log("Signaling error: " + JSON.stringify(msg.payload));
        process.exit(1);
        break;

      case "HEARTBEAT":
        break;

      default:
        log("Unknown signaling message: " + msg.type);
    }
  });

  ws.on("close", () => {
    log("Signaling WebSocket closed");
  });

  ws.on("error", (err) => {
    log("Signaling WebSocket error: " + err.message);
    process.exit(1);
  });

  async function initiateConnection() {
    pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    pc.oniceconnectionstatechange = () => {
      log(`ICE: ${pc!.iceConnectionState}`);
    };
    pc.onconnectionstatechange = () => {
      log(`Connection: ${pc!.connectionState}`);
    };

    // ICE candidates → send to host via signaling
    pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        // node-datachannel may add "a=" prefix; strip for browser compatibility
        const candidate = (evt.candidate.candidate ?? "").replace(/^a=/, "");
        sendSignaling({
          type: "CANDIDATE",
          payload: {
            candidate: {
              candidate,
              sdpMid: evt.candidate.sdpMid ?? "0",
              sdpMLineIndex: evt.candidate.sdpMLineIndex ?? 0,
            },
            type: "data",
            connectionId,
          },
          dst: hostPeerId,
        });
      }
    };

    // Create DataChannel
    dc = pc.createDataChannel(connectionId, { ordered: true });

    dc.onopen = () => {
      log("DataChannel open — bot ready");
      bot = new PongBot(sendData);
    };

    dc.onmessage = (event: MessageEvent) => {
      try {
        const json = decodeMessage(event.data);
        const msg: PeerMessage = JSON.parse(json);
        bot?.receive(msg);
      } catch (err: unknown) {
        log(`DC parse error: ${err}`);
      }
    };

    dc.onclose = () => {
      log("DataChannel closed");
      bot?.dispose();
      process.exit(0);
    };

    // Create offer & wait for ICE gathering to complete
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await new Promise<void>((resolve) => {
      if (pc!.iceGatheringState === "complete") {
        resolve();
        return;
      }
      const prev = pc!.onicegatheringstatechange;
      pc!.onicegatheringstatechange = (ev) => {
        if (typeof prev === "function") prev.call(pc, ev);
        if (pc!.iceGatheringState === "complete") resolve();
      };
      setTimeout(resolve, 5000);
    });

    // Send offer with all candidates baked into SDP
    const finalSdp = pc.localDescription!;
    log("Sending OFFER (ICE gathering complete)");
    sendSignaling({
      type: "OFFER",
      payload: {
        sdp: { type: finalSdp.type, sdp: finalSdp.sdp },
        type: "data",
        connectionId,
        label: connectionId,
        reliable: true,
        serialization: "json",
        metadata: {},
      },
      dst: hostPeerId,
    });
  }

  // Heartbeat to keep signaling alive
  setInterval(() => {
    sendSignaling({ type: "HEARTBEAT" });
  }, 5000);

  // Graceful shutdown
  process.on("SIGINT", () => {
    log("Shutting down...");
    bot?.dispose();
    dc?.close();
    pc?.close();
    ws.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
