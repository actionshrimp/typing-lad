import React, { useEffect, useRef, useState, useCallback } from "react";
import type { Engine, SessionResult } from "@typing-lad/core";
import { PongGame, type PongGameState } from "../pong/game";
import type { PongNetLike } from "../pong/net";
import type { PeerMessage } from "../pong/protocol";

interface MultiplayerPongProps {
  engine: Engine;
  isPlayer1: boolean;
  net: PongNetLike;
  onDone: (result: SessionResult) => void;
  onEscape: () => void;
}

export function MultiplayerPong({ engine, isPlayer1, net, onDone, onEscape }: MultiplayerPongProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PongGame | null>(null);
  const [state, setState] = useState<PongGameState | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [rematchSent, setRematchSent] = useState(false);
  const [rematchReceived, setRematchReceived] = useState(false);
  const doneRef = useRef(false);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const netRef = useRef(net);
  netRef.current = net;

  const side = isPlayer1 ? "left" as const : "right" as const;

  // Start a rematch: reset game, send hello with new words
  const startRematch = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    game.restart();
    engine.startSession();
    doneRef.current = false;
    setRematchSent(false);
    setRematchReceived(false);
    netRef.current.send({ type: "hello", words: game.getMyWords() });
  }, [engine]);

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
      onPaddleHit: (msg) => {
        net.send(msg);
      },
      onServe: (msg) => {
        net.send(msg);
      },
      onTypingChange: (targetIds, prefix) => {
        net.send({ type: "typing", targetIds, typedPrefix: prefix });
      },
      onWordDone: (slotIndex, newWord, paddleTargetY, word, typed, durationMs) => {
        net.send({ type: "word_done", slotIndex, newWord, paddleTargetY, word, typed, durationMs });
      },
    }, { mode: "multiplayer", side });

    gameRef.current = game;

    // Send hello with my words
    net.send({ type: "hello", words: game.getMyWords() });

    // Wire incoming messages — game processes them in order during tick
    // Rematch messages are intercepted here instead of being forwarded to the game
    net.onMessage = (msg: PeerMessage) => {
      if (msg.type === "rematch") {
        setRematchReceived(true);
        return;
      }
      gameRef.current?.receiveMessage(msg);
    };

    // Handle disconnection
    net.onStatusChange = (s) => {
      if (s === "disconnected" || s === "error") {
        setDisconnected(true);
      }
    };

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
      net.dispose();
    };
  }, [engine, net, isPlayer1, side]);

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

  // Session end — only fire onDone in solo mode (this component is multiplayer-only,
  // so we just end the engine session without auto-navigating away)
  useEffect(() => {
    if (!state) return;
    if (state.sessionComplete && !doneRef.current) {
      doneRef.current = true;
      engine.endSession("pong");
    }
  }, [state?.sessionComplete, engine]);

  // Auto-start rematch when both players have agreed
  useEffect(() => {
    if (rematchSent && rematchReceived) {
      startRematch();
    }
  }, [rematchSent, rematchReceived, startRematch]);

  // Compute field rect for word label positioning
  const fieldRect = gameRef.current?.getFieldRect() ?? { left: 0, top: 0, width: 800, height: 500 };

  // Determine label positions based on side
  const myWordsX = side === "left" ? fieldRect.left + 60 : fieldRect.left + fieldRect.width - 200;
  const opponentWordsX = side === "left" ? fieldRect.left + fieldRect.width - 200 : fieldRect.left + 60;

  // Score labels
  const leftLabel = isPlayer1 ? "YOU" : "OPP";
  const rightLabel = isPlayer1 ? "OPP" : "YOU";

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[500px]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {state && (
        <>
          {/* Score display - top center */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-6 pointer-events-none">
            <div className="flex flex-col items-center">
              <div className="text-xs text-text-dim mb-1">{leftLabel}</div>
              <div className={`text-3xl font-bold font-mono ${isPlayer1 ? "text-accent" : "text-incorrect"} score-flash`}>
                {state.playerScore}
              </div>
            </div>
            <div className="text-sm font-semibold text-text-dim tracking-widest">VS</div>
            <div className="flex flex-col items-center">
              <div className="text-xs text-text-dim mb-1">{rightLabel}</div>
              <div className={`text-3xl font-bold font-mono ${isPlayer1 ? "text-incorrect" : "text-accent"} score-flash`}>
                {state.cpuScore}
              </div>
            </div>
          </div>

          {/* My word labels */}
          {state.words.map((w) => (
            <div
              key={w.id}
              className="absolute pointer-events-none"
              style={{
                left: myWordsX,
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

          {/* Opponent word labels */}
          {state.opponentWords.map((w) => (
            <div
              key={w.id}
              className="absolute pointer-events-none"
              style={{
                left: opponentWordsX,
                top: fieldRect.top + w.yPosition * fieldRect.height,
                transform: "translateY(-50%)",
              }}
            >
              <div
                className={`px-2 py-0.5 rounded font-mono text-sm font-bold whitespace-nowrap ${
                  w.isTargeted
                    ? "bg-incorrect/30 text-text-secondary"
                    : "bg-surface/50 text-text-dim"
                }`}
              >
                <span className="text-incorrect">{w.typed}</span>
                <span>{w.word.slice(w.typed.length)}</span>
              </div>
            </div>
          ))}

          {/* Game over overlay */}
          {state.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/80">
              {(() => {
                const iWon = (isPlayer1 && state.playerWon) || (!isPlayer1 && !state.playerWon);
                return (
                  <>
                    <div className={`text-4xl font-bold mb-2 ${iWon ? "text-correct" : "text-incorrect"}`}>
                      {iWon ? "YOU WIN!" : "YOU LOSE"}
                    </div>
                    <div className="text-lg text-text-secondary font-mono mb-6">
                      <span className="text-accent">{state.playerScore}</span>
                      {" — "}
                      <span className="text-incorrect">{state.cpuScore}</span>
                    </div>
                    {!disconnected && (
                      <div className="flex gap-3">
                        {rematchSent ? (
                          <div className="px-6 py-2 rounded-lg bg-surface text-text-secondary font-semibold">
                            Waiting for opponent...
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setRematchSent(true);
                              netRef.current.send({ type: "rematch" });
                            }}
                            className="px-6 py-2 rounded-lg bg-accent text-surface font-semibold hover:brightness-110 transition-all"
                          >
                            Play Again
                          </button>
                        )}
                        <button
                          onClick={() => onEscapeRef.current()}
                          className="px-6 py-2 rounded-lg bg-surface-alt text-text-primary font-semibold hover:brightness-110 transition-all"
                        >
                          Back to Menu
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Disconnection overlay */}
          {disconnected && !state.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/90">
              <div className="text-2xl font-bold text-incorrect mb-2">Connection Lost</div>
              <div className="text-sm text-text-secondary mb-4">Your opponent disconnected.</div>
              <button
                onClick={() => onEscapeRef.current()}
                className="px-6 py-2 rounded-lg bg-accent text-surface font-semibold"
              >
                Back to Menu
              </button>
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
