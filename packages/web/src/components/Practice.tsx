import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Engine,
  LEVEL_NAMES,
  type AttemptResult,
  type SessionResult,
} from "@typing-lad/core";

interface PracticeProps {
  engine: Engine;
  onDone: (result: SessionResult) => void;
  onEscape: () => void;
}

export function Practice({ engine, onDone, onEscape }: PracticeProps) {
  const [target, setTarget] = useState("");
  const [typed, setTyped] = useState("");
  const [firstTyped, setFirstTyped] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<AttemptResult | null>(null);
  const [completedWords, setCompletedWords] = useState<string[]>([]);
  const [upcomingWords, setUpcomingWords] = useState<string[]>([]);
  const wordStartTime = useRef<number>(0);
  const started = useRef(false);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      engine.startSession();
      const word = engine.nextWord();
      setTarget(word);
      wordStartTime.current = Date.now();

      // Pre-fetch a few upcoming words for display
      const upcoming: string[] = [];
      for (let i = 0; i < 3; i++) {
        try {
          upcoming.push(engine.nextWord());
        } catch { break; }
      }
      setUpcomingWords(upcoming);
    }
  }, [engine]);

  const submitWord = useCallback(
    (typedStr: string) => {
      const duration = Date.now() - wordStartTime.current;
      const submission = firstTyped ?? typedStr;
      const result = engine.submitAttempt(target, submission, duration);
      setLastResult(result);
      setFirstTyped(null);
      setTyped("");
      setCompletedWords(prev => [...prev, target]);

      if (engine.sessionDone()) {
        const sessionResult = engine.endSession();
        onDone(sessionResult);
      } else {
        // Shift upcoming words
        let nextW: string;
        if (upcomingWords.length > 0) {
          nextW = upcomingWords[0];
          const remaining = upcomingWords.slice(1);
          try {
            remaining.push(engine.nextWord());
          } catch { /* no more */ }
          setUpcomingWords(remaining);
        } else {
          nextW = engine.nextWord();
        }
        setTarget(nextW);
        wordStartTime.current = Date.now();
      }
    },
    [engine, target, firstTyped, onDone, upcomingWords]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        engine.endSession();
        onEscape();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;

      e.preventDefault();
      const newTyped = typed + e.key;

      const idx = newTyped.length - 1;
      if (idx < target.length && newTyped[idx] !== target[idx]) {
        if (firstTyped === null) {
          setFirstTyped(newTyped);
        }
        setTyped("");
        wordStartTime.current = Date.now();
        return;
      }

      if (newTyped.length === target.length) {
        submitWord(newTyped);
        return;
      }

      setTyped(newTyped);
    },
    [typed, target, firstTyped, submitWord, engine, onEscape]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const renderTarget = () => {
    const chars: React.ReactNode[] = [];
    for (let i = 0; i < target.length; i++) {
      let className: string;
      if (i < typed.length) {
        className = typed[i] === target[i] ? "char-correct" : "char-incorrect";
      } else if (i === typed.length) {
        className = "char-cursor cursor-blink";
      } else {
        className = "char-untyped";
      }
      chars.push(
        <span key={i} className={className}>
          {target[i]}
        </span>
      );
    }
    return chars;
  };

  const accuracy = lastResult
    ? (lastResult.accuracy * 100).toFixed(0)
    : "100";

  const currentWpm = lastResult ? lastResult.wpm.toFixed(0) : "—";

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-border">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase">Session Progress</span>
          <span className="text-lg font-bold text-text-primary">
            {engine.wordsCompleted}/{engine.sessionSize}
            <span className="text-xs text-text-dim ml-1">words</span>
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase">Live Accuracy</span>
          <span className={`text-lg font-bold ${
            Number(accuracy) >= 95 ? "text-correct" : Number(accuracy) >= 80 ? "text-yellow-400" : "text-incorrect"
          }`}>
            {accuracy}%
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase">Session WPM</span>
          <span className="text-lg font-bold text-text-primary">{currentWpm}</span>
        </div>
      </div>

      {/* Word stream */}
      <div className="flex items-center gap-4 mb-12 min-h-[80px] font-mono">
        {/* Completed words (dim) */}
        <div className="flex gap-3 justify-end flex-shrink-0">
          {completedWords.slice(-3).map((w, i) => (
            <span key={i} className="text-2xl text-text-dim/20 font-bold">{w}</span>
          ))}
        </div>

        {/* Active word */}
        <div className="flex flex-col items-center flex-shrink-0">
          <span className="text-[10px] font-semibold tracking-[0.3em] text-accent uppercase mb-1">Target</span>
          <div className="text-4xl font-bold tracking-wider border-b-2 border-accent pb-1">
            {renderTarget()}
          </div>
        </div>

        {/* Upcoming words (dim) */}
        <div className="flex gap-3 flex-shrink-0">
          {upcomingWords.map((w, i) => (
            <span key={i} className="text-2xl text-text-dim/30 font-bold">{w}</span>
          ))}
        </div>
      </div>

      {/* Bottom panel */}
      <div className="grid grid-cols-2 gap-4">
        {/* Session Performance Metrics */}
        <div className="p-4 rounded-lg border border-border bg-surface-raised">
          <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-3">
            Session Performance
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Raw Speed</span>
              <span className="font-mono font-bold">{currentWpm} WPM</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Errors</span>
              <span className="font-mono font-bold text-incorrect">
                {lastResult && !lastResult.isCorrect ? "1" : "0"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Level</span>
              <span className="font-mono font-bold">{LEVEL_NAMES[engine.currentLevel]}</span>
            </div>
          </div>
        </div>

        {/* Practice Tip */}
        <div className="p-4 rounded-lg border border-border bg-surface-raised">
          <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-3">
            Practice Tip
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">
            Focus on accuracy first, speed will follow.
            Mistakes reset the word — type deliberately.
          </p>
        </div>
      </div>

      {/* Keyboard shortcuts */}
      <div className="flex gap-4 mt-6 text-xs text-text-dim">
        <span><kbd className="px-1.5 py-0.5 rounded bg-surface-raised border border-border text-text-secondary">ESC</kbd> Quit session</span>
      </div>
    </div>
  );
}
