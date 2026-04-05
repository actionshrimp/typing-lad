/**
 * HeadlessPongPeer — game.ts physics without Three.js.
 *
 * Supports both host (left) and client (right) roles with full ball physics,
 * paddle glide, scoring, serve logic, and message processing.
 */

import type {
  PeerMessage,
  HitMsg,
  ServeMsg,
  HelloMsg,
  WordDoneMsg,
} from "../../packages/web/src/pong/protocol";

// --- Constants (must match game.ts) ---

const FIELD_W = 800;
const FIELD_H = 500;
const PADDLE_W = 14;
const PADDLE_H = 80;
const PADDLE_MARGIN = 40;
const BALL_R = 8;
const BALL_SPEED_INIT = 175;
const BALL_SPEED_INCREMENT = 8;
const BALL_SPEED_MAX = 350;
const PADDLE_GLIDE_SPEED = 500;
const WIN_SCORE = 3;
const SERVE_PAUSE = 1.0;
const WORD_SLOTS = 12;
const MAX_BOUNCE_ANGLE = (60 * Math.PI) / 180;

// Export constants for test assertions
export {
  FIELD_W,
  FIELD_H,
  PADDLE_H,
  PADDLE_MARGIN,
  PADDLE_W,
  BALL_R,
  BALL_SPEED_INIT,
  BALL_SPEED_INCREMENT,
  BALL_SPEED_MAX,
  PADDLE_GLIDE_SPEED,
  WIN_SCORE,
  SERVE_PAUSE,
  WORD_SLOTS,
  MAX_BOUNCE_ANGLE,
};

// --- Word Slot ---

interface WordSlot {
  id: number;
  word: string;
  typed: string;
  yPos: number;
  isTargeted: boolean;
}

// --- Options ---

export interface HeadlessPongPeerOptions {
  side: "left" | "right";
  words?: string[];
  serveAngle?: number; // overrides Math.random() for deterministic serves
}

// --- HeadlessPongPeer ---

export class HeadlessPongPeer {
  readonly side: "left" | "right";
  private isHost: boolean;
  private serveAngleOverride: number | undefined;

  // Scores
  leftScore = 0;
  rightScore = 0;

  // Ball state
  ballX = FIELD_W / 2;
  ballY = FIELD_H / 2;
  ballVx = 0;
  ballVy = 0;
  ballSpeed = BALL_SPEED_INIT;
  rallyHits = 0;

  // Serve state
  private serving = false;
  private servePause = 0;
  private serveToPlayer = false; // true = serve goes left
  isServing = false; // public — true when in serve pause (host only)
  isWaitingForRemoteServe = false; // public — true when client waits for serve

  // Game state
  gameOver = false;
  playerWon = false;

  // Paddles
  private leftPaddleY = FIELD_H / 2;
  private leftPaddleTargetY = FIELD_H / 2;
  private rightPaddleY = FIELD_H / 2;
  private rightPaddleTargetY = FIELD_H / 2;

  // Words
  words: WordSlot[] = [];
  opponentWords: WordSlot[] = [];
  private nextWordId = 0;

  // Network
  private pendingRemoteHit: HitMsg | null = null;
  private incomingMessages: PeerMessage[] = [];
  private sentMessages: PeerMessage[] = [];

  constructor(opts: HeadlessPongPeerOptions) {
    this.side = opts.side;
    this.isHost = opts.side === "left";
    this.serveAngleOverride = opts.serveAngle;

    // Initialize word slots
    const wordList = opts.words ?? this.defaultWords();
    const spacing = FIELD_H / (WORD_SLOTS + 1);
    for (let i = 0; i < WORD_SLOTS; i++) {
      this.words.push({
        id: this.nextWordId++,
        word: wordList[i % wordList.length],
        typed: "",
        yPos: spacing * (i + 1),
        isTargeted: false,
      });
    }
  }

  private defaultWords(): string[] {
    return [
      "the", "and", "for", "are", "but", "not", "you", "all",
      "can", "had", "her", "was",
    ];
  }

  // --- Public state accessors ---

  get leftPaddle(): number {
    return this.leftPaddleY;
  }
  get rightPaddle(): number {
    return this.rightPaddleY;
  }

  /** Get my words for hello message */
  getMyWords(): { word: string; yPosition: number }[] {
    return this.words.map((s) => ({ word: s.word, yPosition: s.yPos }));
  }

  // --- Message I/O ---

  /** Queue an incoming message for processing on next tick. */
  receive(msg: PeerMessage): void {
    this.incomingMessages.push(msg);
  }

  /** Capture an outgoing message. */
  private emit(msg: PeerMessage): void {
    this.sentMessages.push(msg);
  }

  /** Return and clear captured outgoing messages. */
  drainSentMessages(): PeerMessage[] {
    const msgs = this.sentMessages;
    this.sentMessages = [];
    return msgs;
  }

  // --- Handshake helpers ---

  sendHello(): void {
    const hello: HelloMsg = {
      type: "hello",
      words: this.getMyWords(),
    };
    this.emit(hello);
  }

  sendStart(): void {
    this.emit({ type: "start" });
  }

  // --- Word completion ---

  /** Instantly complete a word at the given slot index.
   *  Emits word_done, updates paddle target, replaces word. */
  completeWord(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= this.words.length) return;
    const slot = this.words[slotIndex];

    // Update paddle target (my paddle)
    if (this.side === "left") {
      this.leftPaddleTargetY = slot.yPos;
    } else {
      this.rightPaddleTargetY = slot.yPos;
    }

    // Replace word
    const newWord = this.pickReplacementWord();
    const oldWord = slot.word;
    this.words[slotIndex] = {
      id: this.nextWordId++,
      word: newWord,
      typed: "",
      yPos: slot.yPos,
      isTargeted: false,
    };

    // Emit word_done
    const msg: WordDoneMsg = {
      type: "word_done",
      slotIndex,
      newWord,
      paddleTargetY: slot.yPos,
      word: oldWord,
      typed: oldWord,
      durationMs: 100,
    };
    this.emit(msg);
  }

  private pickReplacementWord(): string {
    const active = new Set(this.words.map((s) => s.word));
    const pool = this.defaultWords().filter((w) => !active.has(w));
    return pool.length > 0 ? pool[0] : "test";
  }

  // --- Main tick ---

  /** Advance simulation by dt seconds.
   *  Order: drainMessages → updateServe → updateBall → updatePaddles */
  tick(dt: number): void {
    this.drainMessages();
    this.updateServe(dt);
    this.updateBall(dt);
    this.updatePaddles(dt);
  }

  // --- Message processing (matches game.ts drainMessages) ---

  private drainMessages(): void {
    for (const msg of this.incomingMessages) {
      switch (msg.type) {
        case "hello":
          this.setOpponentWords((msg as HelloMsg).words);
          this.startMultiplayerServe(false);
          break;

        case "word_done": {
          const wd = msg as WordDoneMsg;
          this.replaceOpponentWord(wd.slotIndex, wd.newWord);
          this.setOpponentPaddleTarget(wd.paddleTargetY);
          break;
        }

        case "hit":
          // Only accept hits during active play
          if (!this.serving && !this.isWaitingForRemoteServe) {
            this.pendingRemoteHit = msg as HitMsg;
          }
          break;

        case "serve": {
          const serve = msg as ServeMsg;
          this.leftScore = serve.leftScore;
          this.rightScore = serve.rightScore;

          // Check game over
          if (this.leftScore >= WIN_SCORE) {
            this.gameOver = true;
            this.playerWon = this.side === "left";
          } else if (this.rightScore >= WIN_SCORE) {
            this.gameOver = true;
            this.playerWon = this.side === "right";
          }

          // Reset ball and apply serve velocity
          this.ballX = FIELD_W / 2;
          this.ballY = FIELD_H / 2;
          this.ballVx = serve.ballVx;
          this.ballVy = serve.ballVy;
          this.ballSpeed = BALL_SPEED_INIT;
          this.rallyHits = 0;
          this.serving = false;
          this.isServing = false;
          this.isWaitingForRemoteServe = false;
          this.pendingRemoteHit = null;
          break;
        }

        case "start":
        case "typing":
          // Handled but no physics impact
          break;
      }
    }
    this.incomingMessages = [];
  }

  // --- Opponent words ---

  private setOpponentWords(words: { word: string; yPosition: number }[]): void {
    this.opponentWords = words.map((w, i) => ({
      id: 10000 + i,
      word: w.word,
      typed: "",
      yPos: w.yPosition,
      isTargeted: false,
    }));
  }

  private replaceOpponentWord(slotIndex: number, newWord: string): void {
    if (slotIndex >= 0 && slotIndex < this.opponentWords.length) {
      const old = this.opponentWords[slotIndex];
      this.opponentWords[slotIndex] = {
        id: this.nextWordId++,
        word: newWord,
        typed: "",
        yPos: old.yPos,
        isTargeted: false,
      };
    }
  }

  private setOpponentPaddleTarget(y: number): void {
    if (this.side === "left") {
      this.rightPaddleTargetY = y;
    } else {
      this.leftPaddleTargetY = y;
    }
  }

  // --- Serve (matches game.ts resetBall + updateServe) ---

  private startMultiplayerServe(toLeft: boolean): void {
    this.ballX = FIELD_W / 2;
    this.ballY = FIELD_H / 2;
    this.ballVx = 0;
    this.ballVy = 0;
    this.ballSpeed = BALL_SPEED_INIT;
    this.rallyHits = 0;
    this.serving = true;
    this.servePause = SERVE_PAUSE;
    this.serveToPlayer = toLeft;
    this.isWaitingForRemoteServe = false;
    this.pendingRemoteHit = null;

    // In multiplayer, host (left) always serves; client (right) always waits
    if (!this.isHost) {
      this.isWaitingForRemoteServe = true;
      this.isServing = false;
    } else {
      this.isServing = true;
    }
  }

  private updateServe(dt: number): void {
    if (!this.serving) return;
    if (this.isWaitingForRemoteServe) return;

    this.servePause -= dt;
    if (this.servePause <= 0) {
      this.serving = false;
      this.isServing = false;

      const angle =
        this.serveAngleOverride !== undefined
          ? this.serveAngleOverride
          : (Math.random() - 0.5) * MAX_BOUNCE_ANGLE * 0.5;
      const dir = this.serveToPlayer ? -1 : 1;
      this.ballVx = Math.cos(angle) * this.ballSpeed * dir;
      this.ballVy = Math.sin(angle) * this.ballSpeed;

      // Emit serve message (host sends to client)
      const serveMsg: ServeMsg = {
        type: "serve",
        ballVx: this.ballVx,
        ballVy: this.ballVy,
        leftScore: this.leftScore,
        rightScore: this.rightScore,
      };
      this.emit(serveMsg);
    }
  }

  // --- Ball physics (matches game.ts updateBall) ---

  private updateBall(dt: number): void {
    if (this.serving || this.gameOver) return;

    const isMultiClient = !this.isHost;
    const skipLeftPaddle = isMultiClient;
    const skipRightPaddle = isMultiClient;

    let remaining = dt;
    const maxSteps = 4;
    for (let step = 0; step < maxSteps && remaining > 0; step++) {
      const stepDt = remaining;
      const nx = this.ballX + this.ballVx * stepDt;
      const ny = this.ballY + this.ballVy * stepDt;

      // Top wall
      if (ny - BALL_R < 0) {
        const t = (this.ballY - BALL_R) / -this.ballVy;
        this.ballX += this.ballVx * t;
        this.ballY = BALL_R;
        this.ballVy = -this.ballVy;
        remaining -= t;
        continue;
      }
      // Bottom wall
      if (ny + BALL_R > FIELD_H) {
        const t = (FIELD_H - BALL_R - this.ballY) / this.ballVy;
        this.ballX += this.ballVx * t;
        this.ballY = FIELD_H - BALL_R;
        this.ballVy = -this.ballVy;
        remaining -= t;
        continue;
      }

      // Left paddle collision
      if (!skipLeftPaddle) {
        const playerRight = PADDLE_MARGIN + PADDLE_W / 2;
        if (
          nx - BALL_R < playerRight &&
          this.ballX - BALL_R >= playerRight &&
          this.ballVx < 0
        ) {
          const paddleTop = this.leftPaddleY - PADDLE_H / 2;
          const paddleBot = this.leftPaddleY + PADDLE_H / 2;
          const t = (this.ballX - BALL_R - playerRight) / -this.ballVx;
          const crossY = this.ballY + this.ballVy * t;
          if (crossY + BALL_R >= paddleTop && crossY - BALL_R <= paddleBot) {
            this.ballX = playerRight + BALL_R;
            this.ballY = crossY;
            this.rallyHits++;
            this.ballSpeed = Math.min(
              BALL_SPEED_INIT + this.rallyHits * BALL_SPEED_INCREMENT,
              BALL_SPEED_MAX,
            );
            const offset = (crossY - this.leftPaddleY) / (PADDLE_H / 2);
            const angle = offset * MAX_BOUNCE_ANGLE;
            this.ballVx = Math.cos(angle) * this.ballSpeed;
            this.ballVy = Math.sin(angle) * this.ballSpeed;
            remaining -= t;
            // Emit hit message
            this.emit({
              type: "hit",
              ballVx: this.ballVx,
              ballVy: this.ballVy,
              ballX: this.ballX,
              ballY: this.ballY,
              rallyHits: this.rallyHits,
            } as HitMsg);
            continue;
          }
        }
      } else if (this.pendingRemoteHit && this.ballVx < 0) {
        const playerRight = PADDLE_MARGIN + PADDLE_W / 2;
        if (nx - BALL_R <= playerRight) {
          this.applyPendingHit();
          remaining = 0;
          continue;
        }
      }

      // Right paddle collision
      if (!skipRightPaddle) {
        const cpuLeft = FIELD_W - PADDLE_MARGIN - PADDLE_W / 2;
        if (
          nx + BALL_R > cpuLeft &&
          this.ballX + BALL_R <= cpuLeft &&
          this.ballVx > 0
        ) {
          const paddleTop = this.rightPaddleY - PADDLE_H / 2;
          const paddleBot = this.rightPaddleY + PADDLE_H / 2;
          const t = (cpuLeft - this.ballX - BALL_R) / this.ballVx;
          const crossY = this.ballY + this.ballVy * t;
          if (crossY + BALL_R >= paddleTop && crossY - BALL_R <= paddleBot) {
            this.ballX = cpuLeft - BALL_R;
            this.ballY = crossY;
            this.rallyHits++;
            this.ballSpeed = Math.min(
              BALL_SPEED_INIT + this.rallyHits * BALL_SPEED_INCREMENT,
              BALL_SPEED_MAX,
            );
            const offset = (crossY - this.rightPaddleY) / (PADDLE_H / 2);
            const angle = offset * MAX_BOUNCE_ANGLE;
            this.ballVx = -Math.cos(angle) * this.ballSpeed;
            this.ballVy = Math.sin(angle) * this.ballSpeed;
            remaining -= t;
            // Emit hit message
            this.emit({
              type: "hit",
              ballVx: this.ballVx,
              ballVy: this.ballVy,
              ballX: this.ballX,
              ballY: this.ballY,
              rallyHits: this.rallyHits,
            } as HitMsg);
            continue;
          }
        }
      } else if (this.pendingRemoteHit && this.ballVx > 0) {
        const cpuLeft = FIELD_W - PADDLE_MARGIN - PADDLE_W / 2;
        if (nx + BALL_R >= cpuLeft) {
          this.applyPendingHit();
          remaining = 0;
          continue;
        }
      }

      // No collision — advance
      this.ballX = nx;
      this.ballY = ny;
      remaining = 0;
    }

    // Score detection — only host detects
    const canDetectScore = this.isHost;
    if (this.ballX < 0) {
      if (canDetectScore) {
        this.rightScore++;
        if (this.rightScore >= WIN_SCORE) {
          this.gameOver = true;
          this.playerWon = false; // host (left) lost
          this.emitFinalScore();
        } else {
          this.startMultiplayerServe(false); // left serves
        }
      }
    } else if (this.ballX > FIELD_W) {
      if (canDetectScore) {
        this.leftScore++;
        if (this.leftScore >= WIN_SCORE) {
          this.gameOver = true;
          this.playerWon = true; // host (left) won
          this.emitFinalScore();
        } else {
          this.startMultiplayerServe(true); // right serves (serve goes left)
        }
      }
    }

    // Client: ball escaped field → freeze and wait for host serve
    if (isMultiClient && (this.ballX < -BALL_R * 2 || this.ballX > FIELD_W + BALL_R * 2)) {
      this.ballX = FIELD_W / 2;
      this.ballY = FIELD_H / 2;
      this.ballVx = 0;
      this.ballVy = 0;
      this.serving = true;
      this.isWaitingForRemoteServe = true;
      this.pendingRemoteHit = null;
    }
  }

  /** Emit a serve message with final scores so the client can sync on game over.
   *  game.ts doesn't emit a serve for the winning point, but tests need both
   *  peers to agree on the outcome. */
  private emitFinalScore(): void {
    this.emit({
      type: "serve",
      ballVx: 0,
      ballVy: 0,
      leftScore: this.leftScore,
      rightScore: this.rightScore,
    } as ServeMsg);
  }

  private applyPendingHit(): void {
    const msg = this.pendingRemoteHit!;
    this.pendingRemoteHit = null;
    this.ballX = msg.ballX;
    this.ballY = msg.ballY;
    this.ballVx = msg.ballVx;
    this.ballVy = msg.ballVy;
    this.rallyHits = msg.rallyHits;
    this.ballSpeed = Math.min(
      BALL_SPEED_INIT + this.rallyHits * BALL_SPEED_INCREMENT,
      BALL_SPEED_MAX,
    );
  }

  // --- Paddles ---

  private updatePaddles(dt: number): void {
    // Left paddle glide
    {
      const diff = this.leftPaddleTargetY - this.leftPaddleY;
      const maxMove = PADDLE_GLIDE_SPEED * dt;
      if (Math.abs(diff) <= maxMove) {
        this.leftPaddleY = this.leftPaddleTargetY;
      } else {
        this.leftPaddleY += Math.sign(diff) * maxMove;
      }
      this.leftPaddleY = Math.max(
        PADDLE_H / 2,
        Math.min(FIELD_H - PADDLE_H / 2, this.leftPaddleY),
      );
    }

    // Right paddle glide
    {
      const diff = this.rightPaddleTargetY - this.rightPaddleY;
      const maxMove = PADDLE_GLIDE_SPEED * dt;
      if (Math.abs(diff) <= maxMove) {
        this.rightPaddleY = this.rightPaddleTargetY;
      } else {
        this.rightPaddleY += Math.sign(diff) * maxMove;
      }
      this.rightPaddleY = Math.max(
        PADDLE_H / 2,
        Math.min(FIELD_H - PADDLE_H / 2, this.rightPaddleY),
      );
    }
  }
}
