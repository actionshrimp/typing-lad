import React, { useEffect, useRef, useState, useCallback } from "react";
import type { Engine, SessionResult } from "@typing-lad/core";
import { ZombieGame, type ZombieGameState } from "../zombie/game";

interface ZombieProps {
  engine: Engine;
  onDone: (result: SessionResult) => void;
  onEscape: () => void;
}

export function Zombie({ engine, onDone, onEscape }: ZombieProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ZombieGame | null>(null);
  const [state, setState] = useState<ZombieGameState | null>(null);
  const [damageFlash, setDamageFlash] = useState(false);
  const prevHpRef = useRef(3);
  const doneRef = useRef(false);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    engine.startSession();

    const game = new ZombieGame(canvas, {
      onStateChange: (s) => setState(s),
      onRequestWord: () => engine.nextWord(),
      onWordCompleted: (word, typed, durationMs) => {
        engine.submitAttempt(word, typed, durationMs);
      },
      onWordFailed: (word, typed, durationMs) => {
        engine.submitAttempt(word, typed, durationMs);
      },
    });
    gameRef.current = game;

    const { width, height } = container.getBoundingClientRect();
    game.resize(width, height);
    game.start();

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      game.resize(rect.width, rect.height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      game.dispose();
      gameRef.current = null;
    };
  }, [engine]);

  // Keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscapeRef.current();
        return;
      }
      if (e.key.length === 1 && e.key >= "a" && e.key <= "z") {
        gameRef.current?.handleKeyPress(e.key);
      } else if (e.key.length === 1 && e.key >= "A" && e.key <= "Z") {
        gameRef.current?.handleKeyPress(e.key.toLowerCase());
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Damage flash
  useEffect(() => {
    if (!state) return;
    if (state.hp < prevHpRef.current) {
      setDamageFlash(true);
      const t = setTimeout(() => setDamageFlash(false), 300);
      prevHpRef.current = state.hp;
      return () => clearTimeout(t);
    }
    prevHpRef.current = state.hp;
  }, [state?.hp]);

  // Session end
  useEffect(() => {
    if (!state) return;
    if ((state.sessionComplete || state.gameOver) && !doneRef.current) {
      doneRef.current = true;
      const result = engine.endSession("zombie");
      // Short delay so final state renders
      setTimeout(() => onDoneRef.current(result), 1200);
    }
  }, [state?.sessionComplete, state?.gameOver, engine]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[500px]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Damage flash overlay */}
      {damageFlash && (
        <div className="damage-flash absolute inset-0 pointer-events-none" />
      )}

      {/* HUD */}
      {state && (
        <>
          {/* Top bar */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
            {/* HP hearts */}
            <div className="flex gap-1">
              {Array.from({ length: state.maxHp }).map((_, i) => (
                <span
                  key={i}
                  className={`text-xl ${i < state.hp ? "text-incorrect" : "text-text-dim opacity-30"}`}
                >
                  {i < state.hp ? "\u2665" : "\u2661"}
                </span>
              ))}
            </div>
            {/* Kill counter */}
            <div className="text-sm font-mono font-bold text-text-primary">
              <span className="text-correct">{state.kills}</span>
              <span className="text-text-dim"> / 20</span>
            </div>
          </div>

          {/* Word labels */}
          {state.zombies
            .filter((z) => !z.isDying && z.screenX > 0 && z.screenX < 1 && z.screenY > 0 && z.screenY < 1)
            .map((z) => (
              <div
                key={z.id}
                className="absolute pointer-events-none transform -translate-x-1/2"
                style={{
                  left: `${z.screenX * 100}%`,
                  top: `${z.screenY * 100}%`,
                }}
              >
                <div
                  className={`px-2 py-0.5 rounded font-mono text-sm font-bold whitespace-nowrap ${
                    z.isTargeted
                      ? "bg-accent/90 text-surface"
                      : "bg-surface/80 text-text-primary"
                  }`}
                >
                  <span className="text-correct">{z.typed}</span>
                  <span>{z.word.slice(z.typed.length)}</span>
                </div>
              </div>
            ))}

          {/* Game Over overlay */}
          {state.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/80">
              <div className="text-4xl font-bold text-incorrect mb-2">GAME OVER</div>
              <div className="text-lg text-text-secondary font-mono">
                Zombies eliminated: <span className="text-correct">{state.kills}</span>
              </div>
            </div>
          )}

          {/* Session complete overlay */}
          {state.sessionComplete && !state.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/80">
              <div className="text-4xl font-bold text-correct mb-2">MISSION COMPLETE</div>
              <div className="text-lg text-text-secondary font-mono">
                All <span className="text-correct">{state.kills}</span> zombies eliminated
              </div>
            </div>
          )}

          {/* ESC hint */}
          <div className="absolute bottom-4 left-4 text-xs text-text-dim pointer-events-none">
            ESC to exit
          </div>
        </>
      )}
    </div>
  );
}
