import * as THREE from "three";

export interface ZombieGameState {
  zombies: Array<{
    id: number;
    word: string;
    typed: string;
    screenX: number;
    screenY: number;
    isTargeted: boolean;
    isDying: boolean;
  }>;
  kills: number;
  hp: number;
  maxHp: number;
  gameOver: boolean;
  sessionComplete: boolean;
}

export interface ZombieGameCallbacks {
  onStateChange: (state: ZombieGameState) => void;
  onRequestWord: () => string;
  onWordCompleted: (word: string, typed: string, durationMs: number) => void;
  onWordFailed: (word: string, typed: string, durationMs: number) => void;
}

interface Zombie {
  id: number;
  word: string;
  typed: string;
  group: THREE.Group;
  speed: number;
  startedAt: number;
  isDying: boolean;
  deathTimer: number;
}

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

const KILL_TARGET = 20;
const MAX_HP = 3;
const SPAWN_Z = -40;
const DEATH_Z = 1;
const BASE_SPEED = 4;
const BASE_SPAWN_INTERVAL = 3;
const MIN_SPAWN_INTERVAL = 1.5;

export class ZombieGame {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;
  private callbacks: ZombieGameCallbacks;

  private zombies: Zombie[] = [];
  private particles: Particle[] = [];
  private muzzleLight: THREE.PointLight;
  private audioCtx: AudioContext | null = null;

  private nextId = 0;
  private kills = 0;
  private hp = MAX_HP;
  private gameOver = false;
  private sessionComplete = false;
  private targetId: number | null = null;
  private spawnTimer = 0;
  private muzzleTimer = 0;
  private shakeTimer = 0;
  private shakeDuration = 0;
  private shakeIntensity = 0;
  private rafId = 0;
  private running = false;

  private cameraBasePos = new THREE.Vector3(0, 1.6, 2);

  constructor(canvas: HTMLCanvasElement, callbacks: ZombieGameCallbacks) {
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1a2a1a);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1a2a1a, 0.025);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    this.camera.position.copy(this.cameraBasePos);
    this.camera.lookAt(0, 1.2, -20);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(20, 80);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x2a3a2a });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -20);
    this.scene.add(ground);

    // Lighting
    const ambient = new THREE.AmbientLight(0x4a6a4a, 1.0);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0x6a9a6a, 1.2);
    dir.position.set(5, 10, 5);
    this.scene.add(dir);

    // Muzzle flash light (initially off)
    this.muzzleLight = new THREE.PointLight(0xffaa00, 0, 15);
    this.muzzleLight.position.set(0, 1.2, 1);
    this.scene.add(this.muzzleLight);

    this.clock = new THREE.Clock();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.spawnTimer = 0.5; // First spawn quickly
    this.tick();
  }

  dispose(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    this.renderer.dispose();
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  handleKeyPress(key: string): void {
    if (this.gameOver || this.sessionComplete) return;

    const k = key.toLowerCase();
    if (k.length !== 1 || k < "a" || k > "z") return;

    if (this.targetId !== null) {
      // Continue typing current target
      const zombie = this.zombies.find((z) => z.id === this.targetId);
      if (zombie && !zombie.isDying) {
        const nextChar = zombie.word[zombie.typed.length];
        if (nextChar === k) {
          zombie.typed += k;
          this.flashMuzzle();
          this.spawnHitParticles(zombie.group.position);
          this.shake(0.12, 0.25);

          if (zombie.typed === zombie.word) {
            const duration = performance.now() - zombie.startedAt;
            this.callbacks.onWordCompleted(zombie.word, zombie.typed, duration);
            this.killZombie(zombie);
          }
        }
        // Wrong key: ignore (no penalty)
      }
    } else {
      // Try to target a zombie by first letter (closest first)
      const candidates = this.zombies
        .filter((z) => !z.isDying && z.word[0] === k)
        .sort((a, b) => b.group.position.z - a.group.position.z); // closest = highest z

      if (candidates.length > 0) {
        const zombie = candidates[0];
        zombie.typed = k;
        zombie.startedAt = performance.now();
        this.targetId = zombie.id;
        this.flashMuzzle();
        this.spawnHitParticles(zombie.group.position);
        this.shake(0.12, 0.25);

        if (zombie.typed === zombie.word) {
          const duration = performance.now() - zombie.startedAt;
          this.callbacks.onWordCompleted(zombie.word, zombie.typed, duration);
          this.killZombie(zombie);
        }
      }
    }
  }

  private tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const dt = this.clock.getDelta();

    this.updateSpawning(dt);
    this.updateZombies(dt);
    this.updateParticles(dt);
    this.updateEffects(dt);
    this.updateCamera(dt);

    this.renderer.render(this.scene, this.camera);
    this.emitState();
  };

  private updateSpawning(dt: number): void {
    if (this.gameOver || this.sessionComplete) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const maxOnScreen = Math.min(2 + Math.floor(this.kills / 5), 5);
      const alive = this.zombies.filter((z) => !z.isDying).length;
      if (alive < maxOnScreen) {
        this.spawnZombie();
      }
      const interval = Math.max(
        BASE_SPAWN_INTERVAL - this.kills * 0.1,
        MIN_SPAWN_INTERVAL
      );
      this.spawnTimer = interval;
    }
  }

  private spawnZombie(): void {
    const word = this.callbacks.onRequestWord();
    const group = this.createZombieModel();

    // Random x offset
    const x = (Math.random() - 0.5) * 6;
    group.position.set(x, 0, SPAWN_Z);
    this.scene.add(group);

    // Longer words → slightly slower (more time)
    const wordFactor = 1 - Math.min(word.length - 3, 5) * 0.04;
    const variance = 0.8 + Math.random() * 0.4; // ±20%
    const speed = BASE_SPEED * wordFactor * variance;

    this.zombies.push({
      id: this.nextId++,
      word,
      typed: "",
      group,
      speed,
      startedAt: performance.now(),
      isDying: false,
      deathTimer: 0,
    });
  }

  private createZombieModel(): THREE.Group {
    const group = new THREE.Group();

    // Body (cylinder)
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.25, 1.2, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a4a2a });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    group.add(body);

    // Head (sphere)
    const headGeo = new THREE.SphereGeometry(0.22, 8, 8);
    const headMat = new THREE.MeshLambertMaterial({ color: 0x3a6a3a });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.72;
    group.add(head);

    // Eyes (red emissive dots)
    const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.08, 1.75, 0.18);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.08, 1.75, 0.18);
    group.add(rightEye);

    // Arms (cylinders reaching forward)
    const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6);
    const armMat = new THREE.MeshLambertMaterial({ color: 0x2a4a2a });

    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.35, 1.2, -0.3);
    leftArm.rotation.x = -Math.PI / 3;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.35, 1.2, -0.3);
    rightArm.rotation.x = -Math.PI / 3;
    group.add(rightArm);

    // Scale up so zombies are visible even at distance
    group.scale.setScalar(2.4);

    return group;
  }

  private updateZombies(dt: number): void {
    const toRemove: number[] = [];

    for (const zombie of this.zombies) {
      if (zombie.isDying) {
        zombie.deathTimer += dt;
        // Tilt backward, sink, fade
        zombie.group.rotation.x = Math.min(zombie.deathTimer * 3, Math.PI / 4);
        zombie.group.position.y = -zombie.deathTimer * 2;
        zombie.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material instanceof THREE.Material) {
            obj.material.transparent = true;
            obj.material.opacity = Math.max(1 - zombie.deathTimer * 2, 0);
          }
        });
        if (zombie.deathTimer > 0.5) {
          toRemove.push(zombie.id);
        }
        continue;
      }

      // Walk toward player
      zombie.group.position.z += zombie.speed * dt;

      // Shamble animation (sine-wave sway)
      const t = this.clock.elapsedTime * 3 + zombie.id;
      zombie.group.rotation.z = Math.sin(t) * 0.08;
      zombie.group.position.y = Math.abs(Math.sin(t * 2)) * 0.05;

      // Reached player
      if (zombie.group.position.z >= DEATH_Z) {
        const duration = performance.now() - zombie.startedAt;
        this.callbacks.onWordFailed(zombie.word, zombie.typed, duration);
        this.hp--;
        this.shake(0.4, 0.5);

        if (this.targetId === zombie.id) {
          this.targetId = null;
        }
        toRemove.push(zombie.id);

        if (this.hp <= 0) {
          this.gameOver = true;
        }
      }
    }

    for (const id of toRemove) {
      const idx = this.zombies.findIndex((z) => z.id === id);
      if (idx !== -1) {
        this.scene.remove(this.zombies[idx].group);
        this.zombies.splice(idx, 1);
      }
    }
  }

  private killZombie(zombie: Zombie): void {
    zombie.isDying = true;
    zombie.deathTimer = 0;
    this.kills++;
    if (this.targetId === zombie.id) {
      this.targetId = null;
    }
    // Big blood burst on kill
    this.spawnBloodBurst(zombie.group.position);
    this.shake(0.3, 0.4);
    if (this.kills >= KILL_TARGET) {
      this.sessionComplete = true;
    }
  }

  private shake(duration: number, intensity: number): void {
    this.shakeTimer = duration;
    this.shakeDuration = duration;
    this.shakeIntensity = intensity;
  }

  private flashMuzzle(): void {
    this.muzzleLight.intensity = 3;
    this.muzzleTimer = 0.1;
    this.playGunshot();
  }

  private playGunshot(): void {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // Noise burst for the "bang"
    const bufferSize = Math.floor(ctx.sampleRate * 0.15);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.08));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Bandpass to shape the noise
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 800;
    bandpass.Q.value = 0.5;

    // Low-frequency thump
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.08);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.6, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    // Master gain
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.4, now);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    noise.connect(bandpass).connect(master).connect(ctx.destination);
    osc.connect(oscGain).connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.15);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  private spawnHitParticles(pos: THREE.Vector3): void {
    const colors = [0xff0000, 0xcc0000, 0x880000];

    for (let i = 0; i < 20; i++) {
      const size = 0.06 + Math.random() * 0.08;
      const geo = new THREE.SphereGeometry(size, 4, 4);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.position.y += 3.5 + Math.random() * 1.5;
      this.scene.add(mesh);

      const life = 0.5 + Math.random() * 0.2;
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        Math.random() * 7 + 2,
        (Math.random() - 0.5) * 12
      );
      this.particles.push({ mesh, velocity, life, maxLife: life });
    }
  }

  private spawnBloodBurst(pos: THREE.Vector3): void {
    const colors = [0xff0000, 0xdd0000, 0xaa0000, 0x880000];

    for (let i = 0; i < 50; i++) {
      const size = 0.08 + Math.random() * 0.14;
      const geo = new THREE.SphereGeometry(size, 4, 4);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.position.y += 3.2 + Math.random() * 2.0;
      this.scene.add(mesh);

      const life = 0.8 + Math.random() * 0.5;
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 18,
        Math.random() * 10 + 3,
        (Math.random() - 0.5) * 18
      );
      this.particles.push({ mesh, velocity, life, maxLife: life });
    }
  }

  private updateParticles(dt: number): void {
    const toRemove: number[] = [];
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        toRemove.push(i);
        continue;
      }
      p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
      p.velocity.y -= 9.8 * dt;
      if (p.mesh.material instanceof THREE.Material) {
        p.mesh.material.transparent = true;
        p.mesh.material.opacity = p.life / p.maxLife;
      }
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      this.scene.remove(this.particles[idx].mesh);
      this.particles[idx].mesh.geometry.dispose();
      if (this.particles[idx].mesh.material instanceof THREE.Material) {
        this.particles[idx].mesh.material.dispose();
      }
      this.particles.splice(idx, 1);
    }
  }

  private updateEffects(dt: number): void {
    // Muzzle flash decay
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) {
        this.muzzleLight.intensity = 0;
      }
    }
  }

  private updateCamera(dt: number): void {
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const t = Math.max(this.shakeTimer / this.shakeDuration, 0);
      const shake = this.shakeIntensity * t;
      this.camera.position.set(
        this.cameraBasePos.x + (Math.random() - 0.5) * 2 * shake,
        this.cameraBasePos.y + (Math.random() - 0.5) * 2 * shake,
        this.cameraBasePos.z
      );
    } else {
      this.camera.position.copy(this.cameraBasePos);
    }
  }

  private emitState(): void {
    const state: ZombieGameState = {
      zombies: this.zombies.map((z) => {
        const pos = z.group.position.clone();
        pos.y -= 0.3; // Below zombie feet
        const screen = pos.project(this.camera);
        return {
          id: z.id,
          word: z.word,
          typed: z.typed,
          screenX: (screen.x + 1) / 2,
          screenY: (-screen.y + 1) / 2,
          isTargeted: z.id === this.targetId,
          isDying: z.isDying,
        };
      }),
      kills: this.kills,
      hp: this.hp,
      maxHp: MAX_HP,
      gameOver: this.gameOver,
      sessionComplete: this.sessionComplete,
    };
    this.callbacks.onStateChange(state);
  }
}
