import type { PeerMessage } from "./protocol";
import type { NetStatus, PongNetLike } from "./net";

// Game constants (must match game.ts)
const FIELD_W = 800;
const FIELD_H = 500;
const PADDLE_H = 80;
const PADDLE_MARGIN = 40;
const BALL_R = 8;
const BALL_SPEED_INIT = 175;
const BALL_SPEED_INCREMENT = 8;
const BALL_SPEED_MAX = 350;
const WORD_SLOTS = 6;

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
  if (available.length === 0) return BOT_WORDS[Math.floor(Math.random() * BOT_WORDS.length)];
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Headless pong bot that plays as P2 (right paddle) using the multiplayer protocol.
 */
class PongBot {
  private sendToHuman: (msg: PeerMessage) => void;

  // Bot's words (right side)
  private words: { word: string; yPos: number }[] = [];

  // Ball state (local prediction for word targeting — host is authoritative)
  private ballX = FIELD_W / 2;
  private ballY = FIELD_H / 2;
  private ballVx = 0;
  private ballVy = 0;
  private ballSpeed = BALL_SPEED_INIT;
  private rallyHits = 0;

  // Paddle state (bot is right paddle)
  private paddleY = FIELD_H / 2;
  private paddleTargetY = FIELD_H / 2;

  // State
  private waitingForServe = true;

  // Timing
  private intervalId = 0;
  private lastTick = 0;
  private gameStarted = false;

  // Word typing timer
  private typeCooldown = 0;
  private readonly TYPE_INTERVAL = 1.2; // seconds between word completions

  private disposed = false;

  constructor(sendToHuman: (msg: PeerMessage) => void) {
    this.sendToHuman = sendToHuman;
    this.initWords();
  }

  private initWords(): void {
    const active = new Set<string>();
    const spacing = FIELD_H / (WORD_SLOTS + 1);
    for (let i = 0; i < WORD_SLOTS; i++) {
      const word = pickWord(active);
      active.add(word);
      this.words.push({ word, yPos: spacing * (i + 1) });
    }
  }

  receive(msg: PeerMessage): void {
    if (this.disposed) return;

    switch (msg.type) {
      case "hello":
        // Human sent their words. Respond with ours.
        this.sendToHuman({
          type: "hello",
          words: this.words.map((w) => ({ word: w.word, yPosition: w.yPos })),
        });
        break;

      case "start":
        if (!this.gameStarted) {
          this.sendToHuman({ type: "start" });
          this.gameStarted = true;
          this.waitingForServe = true; // P1 serves first
          this.lastTick = performance.now();
          this.intervalId = window.setInterval(() => this.tick(), 16);
        }
        break;

      case "hit":
        // Host is authoritative for all paddle hits — snap ball state
        this.ballX = msg.ballX;
        this.ballY = msg.ballY;
        this.ballVx = msg.ballVx;
        this.ballVy = msg.ballVy;
        this.rallyHits = msg.rallyHits;
        this.ballSpeed = Math.min(
          BALL_SPEED_INIT + this.rallyHits * BALL_SPEED_INCREMENT,
          BALL_SPEED_MAX,
        );
        this.waitingForServe = false;
        break;

      case "serve":
        // Host is authoritative for scoring and serves
        this.ballX = FIELD_W / 2;
        this.ballY = FIELD_H / 2;
        this.ballVx = msg.ballVx;
        this.ballVy = msg.ballVy;
        this.ballSpeed = BALL_SPEED_INIT;
        this.rallyHits = 0;
        this.waitingForServe = false;
        break;

      case "typing":
      case "word_done":
        break;
    }
  }

  // --- Simulation loop ---

  private tick(): void {
    if (this.disposed || !this.gameStarted) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.05);
    this.lastTick = now;

    this.updateBall(dt);
    this.updatePaddle(dt);
    this.updateTyping(dt);
  }

  /** Local ball simulation for prediction only — no hits, no scoring. */
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
    const GLIDE_SPEED = 500;
    const diff = this.paddleTargetY - this.paddleY;
    const maxMove = GLIDE_SPEED * dt;
    if (Math.abs(diff) <= maxMove) {
      this.paddleY = this.paddleTargetY;
    } else {
      this.paddleY += Math.sign(diff) * maxMove;
    }
    this.paddleY = Math.max(PADDLE_H / 2, Math.min(FIELD_H - PADDLE_H / 2, this.paddleY));
  }

  private updateTyping(dt: number): void {
    this.typeCooldown -= dt;
    if (this.typeCooldown > 0) return;

    // Predict where ball will arrive at bot's paddle X
    let targetY = FIELD_H / 2;
    if (this.ballVx > 0 && !this.waitingForServe) {
      const dx = FIELD_W - PADDLE_MARGIN - this.ballX;
      const timeToArrive = dx / this.ballVx;
      targetY = this.ballY + this.ballVy * timeToArrive;
      // Approximate wall bounces
      for (let i = 0; i < 10; i++) {
        if (targetY < 0) targetY = -targetY;
        else if (targetY > FIELD_H) targetY = 2 * FIELD_H - targetY;
        else break;
      }
      targetY = Math.max(PADDLE_H / 2, Math.min(FIELD_H - PADDLE_H / 2, targetY));
    }

    // Find word nearest to target Y
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.words.length; i++) {
      const dist = Math.abs(this.words[i].yPos - targetY);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    const slot = this.words[bestIdx];
    this.paddleTargetY = slot.yPos;

    // Replace word
    const active = new Set(this.words.map((w) => w.word));
    const newWord = pickWord(active);
    const completedWord = slot.word;
    this.words[bestIdx] = { word: newWord, yPos: slot.yPos };

    this.sendToHuman({
      type: "word_done",
      slotIndex: bestIdx,
      newWord,
      paddleTargetY: slot.yPos,
      word: completedWord,
      typed: completedWord,
      durationMs: this.TYPE_INTERVAL * 1000,
    });

    this.typeCooldown = this.TYPE_INTERVAL * (0.7 + Math.random() * 0.6);
  }

  dispose(): void {
    this.disposed = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = 0;
    }
  }
}

/**
 * Fake network layer that pipes messages to/from a PongBot.
 * Drop-in replacement for PongNet — MultiplayerPong can't tell the difference.
 */
export class BotNet implements PongNetLike {
  onStatusChange: ((status: NetStatus) => void) | null = null;
  onMessage: ((msg: PeerMessage) => void) | null = null;
  onError: ((err: string) => void) | null = null;

  private bot: PongBot;
  private _status: NetStatus = "connected";

  constructor() {
    this.bot = new PongBot((msg) => {
      // Bot → human: deliver asynchronously to avoid re-entrancy
      setTimeout(() => this.onMessage?.(msg), 0);
    });
  }

  get status(): NetStatus {
    return this._status;
  }

  send(msg: PeerMessage): void {
    // Human → bot: deliver asynchronously
    setTimeout(() => this.bot.receive(msg), 0);
  }

  dispose(): void {
    this.bot.dispose();
    this._status = "idle";
  }
}
