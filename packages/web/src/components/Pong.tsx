import React, { useEffect, useRef, useState, useCallback } from "react";
import type { Engine, SessionResult } from "@typing-lad/core";
import { PongGame, type PongGameState } from "../pong/game";

interface PongProps {
  engine: Engine;
  onDone: (result: SessionResult) => void;
  onEscape: () => void;
}

export function Pong({ engine, onDone, onEscape }: PongProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PongGame | null>(null);
  const [state, setState] = useState<PongGameState | null>(null);
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

    const game = new PongGame(canvas, {
      onStateChange: (s) => setState(s),
      onRequestWord: (active) => engine.nextWord(active),
      onWordCompleted: (word, typed, durationMs) => {
        engine.submitAttempt(word, typed, durationMs);
      },
    }, { mode: "solo" });
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

  // Session end
  useEffect(() => {
    if (!state) return;
    if (state.sessionComplete && !doneRef.current) {
      doneRef.current = true;
      const result = engine.endSession("pong");
      setTimeout(() => onDoneRef.current(result), 1500);
    }
  }, [state?.sessionComplete, engine]);

  // Compute field rect for word label positioning
  const fieldRect = gameRef.current?.getFieldRect() ?? { left: 0, top: 0, width: 800, height: 500 };

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[500px]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {state && (
        <>
          {/* Score display - top center */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-6 pointer-events-none">
            <div className="text-3xl font-bold font-mono text-accent score-flash">
              {state.playerScore}
            </div>
            <div className="text-sm font-semibold text-text-dim tracking-widest">VS</div>
            <div className="text-3xl font-bold font-mono text-incorrect score-flash">
              {state.cpuScore}
            </div>
          </div>

          {/* Word labels on right side */}
          {state.words.map((w) => (
            <div
              key={w.id}
              className="absolute pointer-events-none"
              style={{
                left: fieldRect.left + 60,
                top: fieldRect.top + w.yPosition * fieldRect.height,
                transform: "translateY(-50%)",
              }}
            >
              <div
                className={`px-2 py-0.5 rounded font-mono text-sm font-bold whitespace-nowrap ${
                  w.isTargeted
                    ? "bg-accent/90 text-surface"
                    : "bg-surface/80 text-text-primary"
                }`}
              >
                <span className="text-correct">{w.typed}</span>
                <span>{w.word.slice(w.typed.length)}</span>
              </div>
            </div>
          ))}

          {/* Game over overlay */}
          {state.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/80">
              <div className={`text-4xl font-bold mb-2 ${state.playerWon ? "text-correct" : "text-incorrect"}`}>
                {state.playerWon ? "YOU WIN!" : "GAME OVER"}
              </div>
              <div className="text-lg text-text-secondary font-mono">
                <span className="text-accent">{state.playerScore}</span>
                {" — "}
                <span className="text-incorrect">{state.cpuScore}</span>
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
