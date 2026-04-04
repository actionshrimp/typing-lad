import * as THREE from "three";

// --- Interfaces ---

export interface PongGameCallbacks {
  onStateChange: (state: PongGameState) => void;
  onRequestWord: (activeWords: ReadonlySet<string>) => string;
  onWordCompleted: (word: string, typed: string, durationMs: number) => void;
}

export interface PongGameState {
  playerScore: number;
  cpuScore: number;
  words: Array<{
    id: number;
    word: string;
    typed: string;
    yPosition: number; // normalized 0-1 within field
    isTargeted: boolean;
  }>;
  playerPaddleY: number; // normalized 0-1
  cpuPaddleY: number;
  ballX: number; // normalized 0-1
  ballY: number;
  gameOver: boolean;
  playerWon: boolean;
  sessionComplete: boolean;
}

// --- Constants ---

const FIELD_W = 800;
const FIELD_H = 500;
const PADDLE_W = 14;
const PADDLE_H = 80;
const PADDLE_MARGIN = 40;
const BALL_R = 8;
const BALL_SPEED_INIT = 175;
const BALL_SPEED_INCREMENT = 8;
const BALL_SPEED_MAX = 350;
const PADDLE_GLIDE_SPEED = 500; // px/s
const CPU_SPEED = 140; // px/s
const CPU_RANDOMNESS = 15; // px offset
const WIN_SCORE = 11;
const SERVE_PAUSE = 1.0; // seconds
const WORD_SLOTS = 12;
const MAX_BOUNCE_ANGLE = (60 * Math.PI) / 180; // 60 degrees
const TRAIL_LENGTH = 20;
const SCORE_BURST_COUNT = 18;
const BOUNCE_PARTICLE_COUNT = 9;
const WORD_PARTICLE_COUNT = 12;

// --- Word Slot ---

interface WordSlot {
  id: number;
  word: string;
  typed: string;
  yPos: number; // field coords (0 = top, FIELD_H = bottom)
  isTargeted: boolean;
}

// --- Particle ---

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export class PongGame {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private clock: THREE.Clock;
  private callbacks: PongGameCallbacks;

  // Game objects
  private playerPaddle!: THREE.Mesh;
  private cpuPaddle!: THREE.Mesh;
  private ball!: THREE.Mesh;
  private ballGlow!: THREE.Mesh;
  private trailPoints: THREE.Mesh[] = [];
  private trailIndex = 0;
  private centerLine!: THREE.LineSegments;

  // State
  private playerScore = 0;
  private cpuScore = 0;
  private playerY = FIELD_H / 2; // center of paddle
  private playerTargetY = FIELD_H / 2;
  private cpuY = FIELD_H / 2;
  private ballX = FIELD_W / 2;
  private ballY = FIELD_H / 2;
  private ballVx = 0;
  private ballVy = 0;
  private ballSpeed = BALL_SPEED_INIT;
  private rallyHits = 0;
  private servePause = 0;
  private serving = true;
  private serveToPlayer = false;
  private gameOver = false;
  private playerWon = false;

  // Words
  private wordSlots: WordSlot[] = [];
  private nextWordId = 0;
  private targetIds: number[] = [];
  private typedPrefix = "";
  private targetStartedAt = 0;

  // Particles
  private particles: Particle[] = [];

  // Audio
  private audioCtx: AudioContext | null = null;

  // Animation
  private rafId = 0;
  private running = false;

  // Scoring flash
  private scoreFlashTimer = 0;

  // CPU AI offset for randomness
  private cpuTargetOffset = 0;
  private cpuOffsetTimer = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: PongGameCallbacks) {
    this.callbacks = callbacks;
    this.clock = new THREE.Clock(false);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0a0a1a);

    // Orthographic camera (will be set in resize)
    this.camera = new THREE.OrthographicCamera(0, FIELD_W, 0, FIELD_H, -100, 100);
    this.scene = new THREE.Scene();

    this.buildScene();
    this.initWordSlots();
  }

  // --- Scene Construction ---

  private buildScene(): void {
    // Border rectangle
    const borderGeo = new THREE.BufferGeometry();
    const bv = new Float32Array([
      0, 0, 0, FIELD_W, 0, 0,
      FIELD_W, 0, 0, FIELD_W, FIELD_H, 0,
      FIELD_W, FIELD_H, 0, 0, FIELD_H, 0,
      0, FIELD_H, 0, 0, 0, 0,
    ]);
    borderGeo.setAttribute("position", new THREE.BufferAttribute(bv, 3));
    const borderMat = new THREE.LineBasicMaterial({ color: 0x2a2a4a });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    this.scene.add(border);

    // Dashed center line
    const dashGeo = new THREE.BufferGeometry();
    const dashes: number[] = [];
    const dashLen = 12;
    const gapLen = 8;
    for (let y = 0; y < FIELD_H; y += dashLen + gapLen) {
      dashes.push(FIELD_W / 2, y, 0, FIELD_W / 2, Math.min(y + dashLen, FIELD_H), 0);
    }
    dashGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(dashes), 3));
    const dashMat = new THREE.LineBasicMaterial({ color: 0x2a2a4a });
    this.centerLine = new THREE.LineSegments(dashGeo, dashMat);
    this.scene.add(this.centerLine);

    // Paddles
    const paddleGeo = new THREE.PlaneGeometry(PADDLE_W, PADDLE_H);
    const playerMat = new THREE.MeshBasicMaterial({ color: 0xfe9d00, side: THREE.DoubleSide }); // accent orange
    const cpuMat = new THREE.MeshBasicMaterial({ color: 0xff4672, side: THREE.DoubleSide }); // red

    this.playerPaddle = new THREE.Mesh(paddleGeo, playerMat);
    this.playerPaddle.position.set(PADDLE_MARGIN, FIELD_H / 2, 0);
    this.scene.add(this.playerPaddle);

    this.cpuPaddle = new THREE.Mesh(paddleGeo, cpuMat);
    this.cpuPaddle.position.set(FIELD_W - PADDLE_MARGIN, FIELD_H / 2, 0);
    this.scene.add(this.cpuPaddle);

    // Ball glow (additive-blended, behind ball)
    const glowGeo = new THREE.CircleGeometry(BALL_R * 3, 24);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.ballGlow = new THREE.Mesh(glowGeo, glowMat);
    this.ballGlow.position.z = -1;
    this.scene.add(this.ballGlow);

    // Ball
    const ballGeo = new THREE.CircleGeometry(BALL_R, 20);
    const ballMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    this.ball = new THREE.Mesh(ballGeo, ballMat);
    this.ball.position.set(FIELD_W / 2, FIELD_H / 2, 0);
    this.scene.add(this.ball);

    // Trail ring buffer
    const trailGeo = new THREE.CircleGeometry(BALL_R * 0.5, 8);
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(trailGeo, mat);
      m.position.set(FIELD_W / 2, FIELD_H / 2, -2);
      this.scene.add(m);
      this.trailPoints.push(m);
    }
  }

  private initWordSlots(): void {
    this.wordSlots = [];
    const slotSpacing = FIELD_H / (WORD_SLOTS + 1);
    for (let i = 0; i < WORD_SLOTS; i++) {
      const yPos = slotSpacing * (i + 1);
      const word = this.requestWord();
      this.wordSlots.push({
        id: this.nextWordId++,
        word,
        typed: "",
        yPos,
        isTargeted: false,
      });
    }
  }

  private requestWord(): string {
    const active = new Set(this.wordSlots.map((s) => s.word));
    return this.callbacks.onRequestWord(active);
  }

  // --- Public API ---

  start(): void {
    this.running = true;
    this.clock.start();
    this.resetBall(true);
    this.emitState();
    this.tick();
  }

  dispose(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
      if (obj instanceof THREE.LineSegments) {
        obj.geometry?.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    });
    this.renderer.dispose();
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h);

    // Letterbox: fit FIELD_W x FIELD_H into w x h
    const scaleX = w / FIELD_W;
    const scaleY = h / FIELD_H;
    const scale = Math.min(scaleX, scaleY);
    const visW = FIELD_W * (w / (FIELD_W * scale));
    const visH = FIELD_H * (h / (FIELD_H * scale));
    const offsetX = (visW - FIELD_W) / 2;
    const offsetY = (visH - FIELD_H) / 2;

    this.camera.left = -offsetX;
    this.camera.right = FIELD_W + offsetX;
    this.camera.top = -offsetY;
    this.camera.bottom = FIELD_H + offsetY;
    this.camera.updateProjectionMatrix();
  }

  getFieldRect(): { left: number; top: number; width: number; height: number } {
    const canvas = this.renderer.domElement;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const scaleX = cw / FIELD_W;
    const scaleY = ch / FIELD_H;
    const scale = Math.min(scaleX, scaleY);
    const fw = FIELD_W * scale;
    const fh = FIELD_H * scale;
    return {
      left: (cw - fw) / 2,
      top: (ch - fh) / 2,
      width: fw,
      height: fh,
    };
  }

  handleKeyPress(key: string): void {
    if (this.gameOver) return;

    const k = key.toLowerCase();
    if (k.length !== 1 || k < "a" || k > "z") return;

    this.ensureAudio();
    this.playKeystrokeTick();

    if (this.targetIds.length > 0) {
      // Mid-typing: narrow down candidates
      const pos = this.typedPrefix.length;
      const stillMatch = this.targetIds.filter((id) => {
        const slot = this.wordSlots.find((s) => s.id === id);
        return slot && pos < slot.word.length && slot.word[pos] === k;
      });

      if (stillMatch.length === 0) return; // wrong key, ignore

      // Drop eliminated slots
      for (const id of this.targetIds) {
        if (!stillMatch.includes(id)) {
          const slot = this.wordSlots.find((s) => s.id === id);
          if (slot) {
            slot.isTargeted = false;
            slot.typed = "";
          }
        }
      }

      this.targetIds = stillMatch;
      this.typedPrefix += k;

      // Update typed on remaining candidates
      for (const id of this.targetIds) {
        const slot = this.wordSlots.find((s) => s.id === id);
        if (slot) slot.typed = this.typedPrefix;
      }

      // Check for completion (only possible when one candidate left)
      if (this.targetIds.length === 1) {
        const slot = this.wordSlots.find((s) => s.id === this.targetIds[0]);
        if (slot && this.typedPrefix.length === slot.word.length) {
          const duration = performance.now() - this.targetStartedAt;
          this.callbacks.onWordCompleted(slot.word, slot.typed, duration);
          this.playerTargetY = slot.yPos;
          this.spawnWordParticles(80, slot.yPos);
          this.playScoreTone();
          this.replaceWordSlot(slot);
          this.targetIds = [];
          this.typedPrefix = "";
        }
      }
      return;
    }

    // No targets: find all word slots starting with this letter
    const matches = this.wordSlots.filter((s) => s.word[0] === k);
    if (matches.length === 0) return;

    this.typedPrefix = k;
    this.targetStartedAt = performance.now();
    this.targetIds = matches.map((s) => s.id);

    for (const slot of matches) {
      slot.typed = k;
      slot.isTargeted = true;
    }

    // Check for single-char word completion (only if exactly one match)
    if (this.targetIds.length === 1) {
      const slot = matches[0];
      if (slot.word.length === 1) {
        const duration = performance.now() - this.targetStartedAt;
        this.callbacks.onWordCompleted(slot.word, slot.typed, duration);
        this.playerTargetY = slot.yPos;
        this.spawnWordParticles(80, slot.yPos);
        this.playScoreTone();
        this.replaceWordSlot(slot);
        this.targetIds = [];
        this.typedPrefix = "";
      }
    }
  }

  // --- Animation Loop ---

  private tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const dt = Math.min(this.clock.getDelta(), 0.05); // cap dt

    this.updateServe(dt);
    this.updateBall(dt);
    this.updatePlayerPaddle(dt);
    this.updateCpuPaddle(dt);
    this.updateParticles(dt);
    this.updateTrail();
    this.updateScoreFlash(dt);

    this.renderer.render(this.scene, this.camera);
    this.emitState();
  };

  // --- Ball ---

  private resetBall(toPlayer: boolean): void {
    this.ballX = FIELD_W / 2;
    this.ballY = FIELD_H / 2;
    this.ballVx = 0;
    this.ballVy = 0;
    this.ballSpeed = BALL_SPEED_INIT;
    this.rallyHits = 0;
    this.serving = true;
    this.servePause = SERVE_PAUSE;
    this.serveToPlayer = toPlayer;
  }

  private updateServe(dt: number): void {
    if (!this.serving) return;
    this.servePause -= dt;
    if (this.servePause <= 0) {
      this.serving = false;
      const angle = (Math.random() - 0.5) * MAX_BOUNCE_ANGLE * 0.5;
      const dir = this.serveToPlayer ? -1 : 1;
      this.ballVx = Math.cos(angle) * this.ballSpeed * dir;
      this.ballVy = Math.sin(angle) * this.ballSpeed;
    }
  }

  private updateBall(dt: number): void {
    if (this.serving || this.gameOver) return;

    // Swept collision step
    let remaining = dt;
    const maxSteps = 4;
    for (let step = 0; step < maxSteps && remaining > 0; step++) {
      const stepDt = remaining;
      const nx = this.ballX + this.ballVx * stepDt;
      const ny = this.ballY + this.ballVy * stepDt;

      // Top/bottom walls
      if (ny - BALL_R < 0) {
        const t = (this.ballY - BALL_R) / -this.ballVy;
        this.ballX += this.ballVx * t;
        this.ballY = BALL_R;
        this.ballVy = -this.ballVy;
        remaining -= t;
        this.playBounceClick();
        this.spawnBounceParticles(this.ballX, 0);
        continue;
      }
      if (ny + BALL_R > FIELD_H) {
        const t = (FIELD_H - BALL_R - this.ballY) / this.ballVy;
        this.ballX += this.ballVx * t;
        this.ballY = FIELD_H - BALL_R;
        this.ballVy = -this.ballVy;
        remaining -= t;
        this.playBounceClick();
        this.spawnBounceParticles(this.ballX, FIELD_H);
        continue;
      }

      // Player paddle collision (left)
      const playerLeft = PADDLE_MARGIN - PADDLE_W / 2;
      const playerRight = PADDLE_MARGIN + PADDLE_W / 2;
      if (
        nx - BALL_R < playerRight &&
        this.ballX - BALL_R >= playerRight &&
        this.ballVx < 0
      ) {
        const paddleTop = this.playerY - PADDLE_H / 2;
        const paddleBot = this.playerY + PADDLE_H / 2;
        // Predict ball y at crossing point
        const t = (this.ballX - BALL_R - playerRight) / -this.ballVx;
        const crossY = this.ballY + this.ballVy * t;
        if (crossY + BALL_R >= paddleTop && crossY - BALL_R <= paddleBot) {
          this.ballX = playerRight + BALL_R;
          this.ballY = crossY;
          this.rallyHits++;
          this.ballSpeed = Math.min(
            BALL_SPEED_INIT + this.rallyHits * BALL_SPEED_INCREMENT,
            BALL_SPEED_MAX
          );
          const offset = (crossY - this.playerY) / (PADDLE_H / 2);
          const angle = offset * MAX_BOUNCE_ANGLE;
          this.ballVx = Math.cos(angle) * this.ballSpeed;
          this.ballVy = Math.sin(angle) * this.ballSpeed;
          remaining -= t;
          this.playPaddleHit();
          this.spawnBounceParticles(this.ballX, this.ballY);
          continue;
        }
      }

      // CPU paddle collision (right)
      const cpuLeft = FIELD_W - PADDLE_MARGIN - PADDLE_W / 2;
      const cpuRight = FIELD_W - PADDLE_MARGIN + PADDLE_W / 2;
      if (
        nx + BALL_R > cpuLeft &&
        this.ballX + BALL_R <= cpuLeft &&
        this.ballVx > 0
      ) {
        const paddleTop = this.cpuY - PADDLE_H / 2;
        const paddleBot = this.cpuY + PADDLE_H / 2;
        const t = (cpuLeft - this.ballX - BALL_R) / this.ballVx;
        const crossY = this.ballY + this.ballVy * t;
        if (crossY + BALL_R >= paddleTop && crossY - BALL_R <= paddleBot) {
          this.ballX = cpuLeft - BALL_R;
          this.ballY = crossY;
          this.rallyHits++;
          this.ballSpeed = Math.min(
            BALL_SPEED_INIT + this.rallyHits * BALL_SPEED_INCREMENT,
            BALL_SPEED_MAX
          );
          const offset = (crossY - this.cpuY) / (PADDLE_H / 2);
          const angle = offset * MAX_BOUNCE_ANGLE;
          this.ballVx = -Math.cos(angle) * this.ballSpeed;
          this.ballVy = Math.sin(angle) * this.ballSpeed;
          remaining -= t;
          this.playPaddleHit();
          this.spawnBounceParticles(this.ballX, this.ballY);
          continue;
        }
      }

      // No collision, advance
      this.ballX = nx;
      this.ballY = ny;
      remaining = 0;
    }

    // Score detection
    if (this.ballX < 0) {
      // CPU scores
      this.cpuScore++;
      this.scoreFlashTimer = 0.4;
      this.spawnScoreParticles(100, FIELD_H / 2, 0xff4672);
      this.playScoreToneGoal();
      if (this.cpuScore >= WIN_SCORE) {
        this.gameOver = true;
        this.playerWon = false;
      } else {
        this.resetBall(false); // serve toward CPU
      }
    } else if (this.ballX > FIELD_W) {
      // Player scores
      this.playerScore++;
      this.scoreFlashTimer = 0.4;
      this.spawnScoreParticles(FIELD_W - 100, FIELD_H / 2, 0xfe9d00);
      this.playScoreToneGoal();
      if (this.playerScore >= WIN_SCORE) {
        this.gameOver = true;
        this.playerWon = true;
      } else {
        this.resetBall(true); // serve toward player
      }
    }

    // Update ball mesh position
    this.ball.position.set(this.ballX, this.ballY, 0);
    this.ballGlow.position.set(this.ballX, this.ballY, -1);
  }

  // --- Paddles ---

  private updatePlayerPaddle(dt: number): void {
    const diff = this.playerTargetY - this.playerY;
    const maxMove = PADDLE_GLIDE_SPEED * dt;
    if (Math.abs(diff) <= maxMove) {
      this.playerY = this.playerTargetY;
    } else {
      this.playerY += Math.sign(diff) * maxMove;
    }
    // Clamp
    this.playerY = Math.max(PADDLE_H / 2, Math.min(FIELD_H - PADDLE_H / 2, this.playerY));
    this.playerPaddle.position.y = this.playerY;
  }

  private updateCpuPaddle(dt: number): void {
    // Randomize target offset periodically
    this.cpuOffsetTimer -= dt;
    if (this.cpuOffsetTimer <= 0) {
      this.cpuTargetOffset = (Math.random() - 0.5) * CPU_RANDOMNESS * 2;
      this.cpuOffsetTimer = 0.3 + Math.random() * 0.4;
    }

    // Only track ball when heading toward CPU
    let targetY = FIELD_H / 2;
    if (this.ballVx > 0 && !this.serving) {
      targetY = this.ballY + this.cpuTargetOffset;
    } else {
      targetY = FIELD_H / 2 + this.cpuTargetOffset;
    }

    const diff = targetY - this.cpuY;
    const maxMove = CPU_SPEED * dt;
    if (Math.abs(diff) <= maxMove) {
      this.cpuY = targetY;
    } else {
      this.cpuY += Math.sign(diff) * maxMove;
    }
    this.cpuY = Math.max(PADDLE_H / 2, Math.min(FIELD_H - PADDLE_H / 2, this.cpuY));
    this.cpuPaddle.position.y = this.cpuY;
  }

  // --- Trail ---

  private updateTrail(): void {
    // Record current ball position in trail ring buffer
    const tp = this.trailPoints[this.trailIndex];
    tp.position.set(this.ballX, this.ballY, -2);
    this.trailIndex = (this.trailIndex + 1) % TRAIL_LENGTH;

    // Update opacities based on age
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const age = (this.trailIndex - i + TRAIL_LENGTH) % TRAIL_LENGTH;
      const mat = this.trailPoints[i].material as THREE.MeshBasicMaterial;
      mat.opacity = this.serving ? 0 : Math.max(0, 1 - age / TRAIL_LENGTH) * 0.4;
    }
  }

  // --- Particles ---

  private spawnBounceParticles(x: number, y: number): void {
    for (let i = 0; i < BOUNCE_PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 120;
      const color = Math.random() > 0.5 ? 0xffffff : 0x44bbff;
      this.addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.3 + Math.random() * 0.2, color, 3);
    }
  }

  private spawnScoreParticles(x: number, y: number, color: number): void {
    for (let i = 0; i < SCORE_BURST_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 200;
      this.addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.5 + Math.random() * 0.3, color, 5);
    }
  }

  private spawnWordParticles(x: number, y: number): void {
    for (let i = 0; i < WORD_PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 100;
      this.addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.3 + Math.random() * 0.2, 0xfe9d00, 4);
    }
  }

  private addParticle(x: number, y: number, vx: number, vy: number, life: number, color: number, size: number): void {
    const geo = new THREE.CircleGeometry(size, 6);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, 1);
    this.scene.add(mesh);
    this.particles.push({ mesh, vx, vy, life, maxLife: life });
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life / p.maxLife;
    }
  }

  private updateScoreFlash(dt: number): void {
    if (this.scoreFlashTimer > 0) {
      this.scoreFlashTimer -= dt;
    }
  }

  // --- Word Slot Management ---

  private replaceWordSlot(slot: WordSlot): void {
    const idx = this.wordSlots.indexOf(slot);
    if (idx < 0) return;
    const word = this.requestWord();
    this.wordSlots[idx] = {
      id: this.nextWordId++,
      word,
      typed: "",
      yPos: slot.yPos,
      isTargeted: false,
    };
  }

  // --- Sound (Web Audio) ---

  private ensureAudio(): void {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
  }

  private playBounceClick(): void {
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 800;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  }

  private playPaddleHit(): void {
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;

    // Tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 400;
    osc.type = "square";
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);

    // Noise burst
    const bufferSize = Math.floor(ctx.sampleRate * 0.04);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.1, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    noise.connect(noiseGain).connect(ctx.destination);
    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + 0.04);
  }

  private playScoreToneGoal(): void {
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.frequency.value = 330;
    osc2.frequency.value = 440;
    osc1.type = "sine";
    osc2.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.05);
    osc1.stop(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.15);
  }

  private playScoreTone(): void {
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 600;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }

  private playKeystrokeTick(): void {
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1200;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.02);
  }

  // --- State Emission ---

  private emitState(): void {
    const state: PongGameState = {
      playerScore: this.playerScore,
      cpuScore: this.cpuScore,
      words: this.wordSlots.map((s) => ({
        id: s.id,
        word: s.word,
        typed: s.typed,
        yPosition: s.yPos / FIELD_H,
        isTargeted: this.targetIds.includes(s.id),
      })),
      playerPaddleY: this.playerY / FIELD_H,
      cpuPaddleY: this.cpuY / FIELD_H,
      ballX: this.ballX / FIELD_W,
      ballY: this.ballY / FIELD_H,
      gameOver: this.gameOver,
      playerWon: this.playerWon,
      sessionComplete: this.gameOver,
    };
    this.callbacks.onStateChange(state);
  }
}
