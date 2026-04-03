import React, { useEffect, useCallback, useRef } from "react";

interface MenuProps {
  onSelect: (item: "practice" | "stats") => void;
  onStartPractice: (mode: "word" | "paragraph") => void;
  onExport: () => void;
  onImport: () => void;
}

export function Menu({ onSelect, onStartPractice, onExport, onImport }: MenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onStartPractice("word");
      }
    },
    [onStartPractice]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <div ref={containerRef} tabIndex={-1} className="outline-none max-w-4xl mx-auto">
      {/* Two-column hero */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Left: Welcome text */}
        <div className="flex flex-col justify-center">
          <div className="text-[10px] font-semibold tracking-[0.3em] text-accent uppercase mb-2">
            Personal Session
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-3 leading-tight">
            Welcome back to<br />your practice.
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Build speed and accuracy through focused typing sessions.
            Your progress is tracked with spaced repetition to optimize learning.
          </p>
          <div className="flex items-center gap-2 text-xs text-text-dim">
            <span className="material-symbols-outlined text-sm">storage</span>
            Progress saved to localStorage
          </div>
        </div>

        {/* Right: Bento grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Practice card - large, spans full width */}
          <button
            onClick={() => onStartPractice("word")}
            className="col-span-2 flex flex-col gap-2 p-5 rounded-lg bg-accent text-surface font-medium text-left hover:bg-accent/90 transition-colors group"
          >
            <span className="material-symbols-outlined text-2xl">keyboard</span>
            <span className="text-lg font-semibold">Practice</span>
            <span className="text-xs opacity-80">Start a 20-word typing session</span>
          </button>

          {/* View Stats tile */}
          <button
            onClick={() => onSelect("stats")}
            className="flex flex-col gap-2 p-4 rounded-lg border border-border bg-surface-raised hover:border-accent/50 transition-colors text-left"
          >
            <span className="material-symbols-outlined text-xl text-info">bar_chart</span>
            <span className="text-sm font-medium">View Stats</span>
            <span className="text-xs text-text-dim">Track your progress</span>
          </button>

          {/* Save Locally tile */}
          <button
            onClick={onExport}
            className="flex flex-col gap-2 p-4 rounded-lg border border-border bg-surface-raised hover:border-accent/50 transition-colors text-left"
          >
            <span className="material-symbols-outlined text-xl text-correct">download</span>
            <span className="text-sm font-medium">Save Locally</span>
            <span className="text-xs text-text-dim">Export as JSON</span>
          </button>

          {/* Restore From File - full width */}
          <button
            onClick={onImport}
            className="col-span-2 flex items-center gap-3 p-4 rounded-lg border border-border bg-surface-raised hover:border-info/50 transition-colors text-left"
          >
            <span className="material-symbols-outlined text-xl text-text-secondary">upload</span>
            <div>
              <span className="text-sm font-medium">Restore From File</span>
              <span className="text-xs text-text-dim ml-2">Import saved progress</span>
            </div>
          </button>
        </div>
      </div>

      {/* Subtitle hint */}
      <div className="text-xs text-text-dim text-center">
        Press Enter to start practice &bull; Use sidebar to select mode
      </div>
    </div>
  );
}
