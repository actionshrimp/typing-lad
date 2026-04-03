import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Engine,
  LEVEL_NAMES,
  type ParagraphResult,
} from "@typing-lad/core";

const PARAGRAPH_WORD_COUNT = 15;

interface ParagraphProps {
  engine: Engine;
  onDone: (result: ParagraphResult) => void;
  onEscape: () => void;
}

export function Paragraph({ engine, onDone, onEscape }: ParagraphProps) {
  const [words, setWords] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const startTime = useRef<number>(0);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const paragraph = engine.generateParagraph(PARAGRAPH_WORD_COUNT);
      setWords(paragraph);
      const now = new Date();
      setStartedAt(now.toISOString());
      startTime.current = Date.now();
    }
  }, [engine]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (words.length === 0) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Backspace") {
        e.preventDefault();
        setTyped((prev) => prev.slice(0, -1));
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        // Restart
        initialized.current = false;
        setTyped("");
        const paragraph = engine.generateParagraph(PARAGRAPH_WORD_COUNT);
        setWords(paragraph);
        const now = new Date();
        setStartedAt(now.toISOString());
        startTime.current = Date.now();
        initialized.current = true;
        return;
      }

      if (e.key.length !== 1) return;
      e.preventDefault();

      const fullTarget = words.join(" ");

      setTyped((prev) => {
        const newTyped = prev + e.key;

        if (newTyped.length >= fullTarget.length) {
          const duration = Date.now() - startTime.current;
          const result = engine.submitParagraph(words, newTyped, duration, startedAt);
          setTimeout(() => onDone(result), 0);
          return newTyped;
        }

        return newTyped;
      });
    },
    [words, engine, startedAt, onDone, onEscape]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (words.length === 0) {
    return <div className="text-text-dim">Loading paragraph...</div>;
  }

  const fullTarget = words.join(" ");

  const elapsedMs = Date.now() - startTime.current;
  const elapsedMin = elapsedMs / 60000;
  const charsTyped = typed.length;
  const runningWpm = elapsedMin > 0 ? (charsTyped / 5) / elapsedMin : 0;

  // Calculate running accuracy
  let correctChars = 0;
  for (let i = 0; i < typed.length && i < fullTarget.length; i++) {
    if (typed[i] === fullTarget[i]) correctChars++;
  }
  const runningAccuracy = typed.length > 0 ? (correctChars / typed.length) * 100 : 100;

  const progress = typed.length / fullTarget.length;

  const renderChars = () => {
    const chars: React.ReactNode[] = [];
    for (let i = 0; i < fullTarget.length; i++) {
      let className: string;
      if (i < typed.length) {
        className = typed[i] === fullTarget[i] ? "char-correct" : "char-incorrect";
      } else if (i === typed.length) {
        className = "char-cursor cursor-blink";
      } else {
        className = "char-untyped";
      }
      chars.push(
        <span key={i} className={className}>
          {fullTarget[i]}
        </span>
      );
    }
    return chars;
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Performance header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <span className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase">Speed</span>
          <div className="text-4xl font-bold text-text-primary">{runningWpm.toFixed(0)} <span className="text-sm text-text-dim font-normal">WPM</span></div>
        </div>
        <div className="text-center">
          <span className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase">Accuracy</span>
          <div className={`text-2xl font-bold ${
            runningAccuracy >= 95 ? "text-correct" : runningAccuracy >= 80 ? "text-yellow-400" : "text-incorrect"
          }`}>
            {runningAccuracy.toFixed(0)}%
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase">Level</span>
          <div className="text-lg font-bold text-text-primary">{LEVEL_NAMES[engine.currentLevel]}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 rounded-full bg-border mb-6">
        <div
          className="h-full rounded-full bg-accent transition-all duration-200"
          style={{ width: `${Math.min(progress * 100, 100)}%` }}
        />
      </div>

      {/* Typing zone */}
      <div className="rounded-lg bg-surface-recessed border border-border-subtle p-6 mb-6">
        <div className="font-mono text-xl leading-relaxed tracking-wide">
          {renderChars()}
        </div>
      </div>

      {/* Shortcuts */}
      <div className="flex gap-6 text-xs text-text-dim">
        <span><kbd className="px-1.5 py-0.5 rounded bg-surface-raised border border-border text-text-secondary">TAB</kbd> Restart</span>
        <span><kbd className="px-1.5 py-0.5 rounded bg-surface-raised border border-border text-text-secondary">ESC</kbd> Change mode</span>
        <span><kbd className="px-1.5 py-0.5 rounded bg-surface-raised border border-border text-text-secondary">⌫</kbd> Backspace</span>
      </div>
    </div>
  );
}
