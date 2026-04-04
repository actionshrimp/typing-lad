import React, { useEffect, useCallback } from "react";
import type { Store, SessionResult, ParagraphResult } from "@typing-lad/core";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface SummaryProps {
  store: Store;
  sessionResult?: SessionResult;
  paragraphResult?: ParagraphResult;
  onContinue: () => void;
  onRetry: () => void;
  onExport: () => void;
}

function formatDuration(startedAt: string, endedAt: string): string {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (isNaN(ms) || ms <= 0) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
}

export function Summary({ store, sessionResult, paragraphResult, onContinue, onRetry, onExport }: SummaryProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onContinue();
      }
    },
    [onContinue]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const stats = store.getStats();

  const isWord = !!sessionResult;
  const avgWpm = sessionResult?.avgWpm ?? paragraphResult?.wpm ?? 0;
  const accuracy = sessionResult?.accuracy ?? paragraphResult?.accuracy ?? 0;
  const totalErrors = sessionResult?.totalErrors ?? 0;
  const startedAt = sessionResult?.startedAt ?? paragraphResult?.startedAt ?? "";
  const endedAt = sessionResult?.endedAt ?? paragraphResult?.endedAt ?? "";
  const duration = formatDuration(startedAt, endedAt);
  const mode = sessionResult?.mode ?? "paragraph";
  const isZombie = mode === "zombie";
  const isPong = mode === "pong";

  // Velocity chart data (word mode only)
  const velocityData = sessionResult?.perWordWpm?.map((wpm, i) => ({
    word: i + 1,
    wpm: Math.round(wpm),
  })) ?? [];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className={`border-l-4 ${isPong ? "border-info" : isZombie ? "border-correct" : "border-accent"} pl-4 mb-8`}>
        <div className={`text-[10px] font-semibold tracking-[0.3em] uppercase mb-1 ${isPong ? "text-info" : isZombie ? "text-correct" : "text-accent"}`}>
          {isPong ? "Match Result" : isZombie ? "Mission Report" : "Session Complete"}
        </div>
        <h1 className="text-2xl font-bold text-text-primary">
          {isPong ? "Pong Complete" : isZombie ? "Zombies Eliminated" : "Session Summary"}
        </h1>
        <p className="text-xs text-text-dim mt-1">
          {new Date(endedAt || Date.now()).toLocaleString()}
        </p>
      </div>

      {/* Bento metrics */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <MetricCard
          label={isPong ? "Typing Speed" : isZombie ? "Avg Kill Speed" : "Avg Velocity"}
          value={`${avgWpm.toFixed(0)}`}
          unit="WPM"
        />
        <MetricCard
          label={isPong ? "Accuracy" : isZombie ? "Hit Accuracy" : "Precision Rate"}
          value={`${(accuracy * 100).toFixed(0)}`}
          unit="%"
          color={accuracy >= 0.95 ? "text-correct" : accuracy >= 0.8 ? "text-yellow-400" : "text-incorrect"}
        />
        <MetricCard
          label={isZombie ? "Damage Taken" : "Total Errors"}
          value={isZombie ? `${3 - (sessionResult?.totalErrors ?? 0) >= 0 ? totalErrors : totalErrors}` : `${totalErrors}`}
          color={totalErrors === 0 ? "text-correct" : "text-incorrect"}
        />
        <MetricCard
          label={isZombie ? "Survival Time" : "Duration"}
          value={duration}
        />
      </div>

      {/* Velocity Chart (word mode) */}
      {velocityData.length > 0 && (
        <div className="p-4 rounded-lg border border-border bg-surface-raised mb-6">
          <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-4">
            Velocity Over Time
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={velocityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="word" stroke="#626262" fontSize={10} />
              <YAxis stroke="#626262" fontSize={10} />
              <Tooltip
                contentStyle={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "6px", fontSize: "12px" }}
                labelStyle={{ color: "#a0a0a0" }}
              />
              <Bar dataKey="wpm" fill="#FE9D00" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Paragraph word results */}
      {paragraphResult && (
        <div className="p-4 rounded-lg border border-border bg-surface-raised mb-6">
          <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-3">
            Word Results — {paragraphResult.wordsCorrect}/{paragraphResult.wordsTotal} correct
          </div>
          <div className="flex flex-wrap gap-2">
            {paragraphResult.words.map((word, i) => (
              <span
                key={i}
                className={`px-2 py-1 rounded text-sm font-mono ${
                  paragraphResult.perWordCorrect[i]
                    ? "bg-correct/10 text-correct"
                    : "bg-incorrect/10 text-incorrect"
                }`}
                title={!paragraphResult.perWordCorrect[i] ? `typed: ${paragraphResult.typed[i] || "<empty>"}` : undefined}
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 mb-8">
        <button
          onClick={onRetry}
          className="px-6 py-2.5 rounded-lg bg-accent text-surface font-semibold text-sm hover:bg-accent/90 transition-colors"
        >
          Next Session
        </button>
        <button
          onClick={onExport}
          className="px-6 py-2.5 rounded-lg border border-border bg-surface-raised text-text-secondary font-medium text-sm hover:border-info/50 transition-colors"
        >
          Save Progress Locally
        </button>
        <button
          onClick={onContinue}
          className="px-6 py-2.5 rounded-lg border border-border bg-surface-raised text-text-secondary font-medium text-sm hover:border-accent/50 transition-colors"
        >
          Back to Home
        </button>
      </div>

      {/* Personal Benchmarks */}
      <div className="p-4 rounded-lg border border-border bg-surface-raised">
        <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-3">
          Personal Benchmarks
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-text-dim">Best WPM</span>
            <div className="font-mono font-bold">{stats.bestWpm > 0 ? Math.round(stats.bestWpm) : "—"}</div>
          </div>
          <div>
            <span className="text-text-dim">Avg Accuracy</span>
            <div className="font-mono font-bold">{stats.totalSessions > 0 ? `${(stats.avgAccuracy * 100).toFixed(0)}%` : "—"}</div>
          </div>
          <div>
            <span className="text-text-dim">Streak</span>
            <div className="font-mono font-bold">{stats.streakDays > 0 ? `${stats.streakDays} day${stats.streakDays !== 1 ? "s" : ""}` : "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-surface-raised">
      <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-2">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color ?? "text-text-primary"}`}>
        {value}
        {unit && <span className="text-xs text-text-dim font-normal ml-1">{unit}</span>}
      </div>
    </div>
  );
}
