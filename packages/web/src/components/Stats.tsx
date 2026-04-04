import React, { useEffect, useCallback } from "react";
import {
  Store,
  Level,
  LEVEL_NAMES,
  wordsByLevel,
} from "@typing-lad/core";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";

interface StatsProps {
  store: Store;
  onBack: () => void;
  onExport: () => void;
  onImport: () => void;
}

// Standard QWERTY keyboard layout rows
const KEYBOARD_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

function formatTime(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
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

export function Stats({ store, onBack, onExport, onImport }: StatsProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
    },
    [onBack]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const stats = store.getStats();
  const keyErrors = store.getKeyErrors();

  // Speed progression chart from recent sessions
  const speedData = stats.recentSessions.slice().reverse().map((s, i) => ({
    session: i + 1,
    wpm: Math.round(s.avgWpm),
  }));

  // Calculate trend line (simple linear regression)
  let trendStart = 0;
  let trendEnd = 0;
  if (speedData.length >= 2) {
    const n = speedData.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += speedData[i].wpm;
      sumXY += i * speedData[i].wpm;
      sumXX += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    trendStart = intercept;
    trendEnd = intercept + slope * (n - 1);
  }
  const speedDataWithTrend = speedData.map((d, i) => ({
    ...d,
    trend: Math.round(trendStart + (trendEnd - trendStart) * (i / Math.max(speedData.length - 1, 1))),
  }));

  // Heatmap: find max error count for scaling
  const maxErrors = Math.max(1, ...Object.values(keyErrors));

  const levels: Level[] = [Level.HomeRow, Level.TopRow, Level.BottomRow, Level.FullAlpha];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-1">Analytics</div>
          <h1 className="text-2xl font-bold text-text-primary">Personal Progress</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onImport}
            className="px-4 py-2 rounded-lg border border-border bg-surface-raised text-text-secondary text-xs font-medium hover:border-info/50 transition-colors"
          >
            Restore Data
          </button>
          <button
            onClick={onExport}
            className="px-4 py-2 rounded-lg border border-border bg-surface-raised text-text-secondary text-xs font-medium hover:border-accent/50 transition-colors"
          >
            Save Progress
          </button>
        </div>
      </div>

      {/* Key figures grid */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <div className="p-4 rounded-lg border border-border bg-surface-raised">
          <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-2">Total Words</div>
          <div className="text-2xl font-bold font-mono">{stats.totalWords}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-surface-raised">
          <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-2">Avg Speed</div>
          <div className="text-2xl font-bold font-mono">{stats.totalSessions > 0 ? Math.round(stats.avgWpm) : "—"} <span className="text-xs text-text-dim font-normal">WPM</span></div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-surface-raised">
          <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-2">Accuracy</div>
          <div className={`text-2xl font-bold font-mono ${
            stats.avgAccuracy >= 0.95 ? "text-correct" : stats.avgAccuracy >= 0.8 ? "text-yellow-400" : "text-incorrect"
          }`}>
            {stats.totalSessions > 0 ? `${(stats.avgAccuracy * 100).toFixed(0)}` : "—"}
            <span className="text-xs text-text-dim font-normal ml-1">%</span>
          </div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-surface-raised">
          <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-2">Practice Time</div>
          <div className="text-2xl font-bold font-mono">{stats.totalPracticeTimeMs > 0 ? formatTime(stats.totalPracticeTimeMs) : "—"}</div>
        </div>
      </div>

      {/* Speed Progression Chart */}
      {speedDataWithTrend.length > 0 && (
        <div className="p-4 rounded-lg border border-border bg-surface-raised mb-6">
          <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-4">
            Speed Progression (Last {speedDataWithTrend.length} Sessions)
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={speedDataWithTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="session" stroke="#626262" fontSize={10} label={{ value: "Session", position: "bottom", fill: "#626262", fontSize: 10 }} />
              <YAxis stroke="#626262" fontSize={10} />
              <Tooltip
                contentStyle={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "6px", fontSize: "12px" }}
                labelStyle={{ color: "#a0a0a0" }}
              />
              <Bar dataKey="wpm" fill="#FE9D00" radius={[2, 2, 0, 0]} name="WPM" />
              <Line type="monotone" dataKey="trend" stroke="#7D56F4" strokeWidth={2} dot={false} name="Trend" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Two-column: Error Heatmap + Session Integrity */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Error Heatmap */}
        <div className="p-4 rounded-lg border border-border bg-surface-raised">
          <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-4">
            Error Heatmap
          </div>
          <div className="flex flex-col items-center gap-1.5">
            {KEYBOARD_ROWS.map((row, ri) => (
              <div key={ri} className="flex gap-1" style={{ paddingLeft: ri === 1 ? "12px" : ri === 2 ? "24px" : 0 }}>
                {row.map((key) => {
                  const errors = keyErrors[key] ?? 0;
                  const intensity = errors / maxErrors;
                  const bg = errors > 0
                    ? `rgba(255, 70, 114, ${0.15 + intensity * 0.7})`
                    : "rgba(255,255,255,0.05)";
                  return (
                    <div
                      key={key}
                      className="w-8 h-8 flex items-center justify-center rounded text-xs font-mono font-bold transition-colors"
                      style={{ backgroundColor: bg }}
                      title={`${key}: ${errors} error${errors !== 1 ? "s" : ""}`}
                    >
                      {key}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3 text-[10px] text-text-dim">
            <span>Low errors</span>
            <div className="flex gap-0.5">
              {[0.1, 0.3, 0.5, 0.7, 0.9].map((v) => (
                <div key={v} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgba(255, 70, 114, ${v})` }} />
              ))}
            </div>
            <span>High errors</span>
          </div>
        </div>

        {/* Session Integrity + Quick Stats */}
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-lg border border-border bg-surface-raised">
            <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-3">
              Session Integrity
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-correct"></span>
              <span className="text-text-secondary">localStorage active</span>
            </div>
            <div className="mt-2 text-xs text-text-dim">
              {stats.totalSessions} sessions stored &bull; {stats.wordsMastered} words mastered
            </div>
          </div>

          {/* Level Breakdown */}
          <div className="p-4 rounded-lg border border-border bg-surface-raised flex-1">
            <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-3">
              Level Progress
            </div>
            <div className="space-y-2">
              {levels.map((level) => {
                const total = wordsByLevel(level).length;
                const mastered = stats.wordsPerLevel[level] ?? 0;
                const pct = total > 0 ? (mastered / total) * 100 : 0;
                return (
                  <div key={level}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-text-secondary">{LEVEL_NAMES[level]}</span>
                      <span className="font-mono text-text-dim">{mastered}/{total}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-border">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Sessions table */}
      {stats.recentSessions.length > 0 && (
        <div className="p-4 rounded-lg border border-border bg-surface-raised mb-6">
          <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-4">
            Recent Sessions
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-dim text-xs border-b border-border">
                <th className="pb-2 font-medium">Timestamp</th>
                <th className="pb-2 font-medium">Mode</th>
                <th className="pb-2 font-medium text-right">Speed</th>
                <th className="pb-2 font-medium text-right">Accuracy</th>
                <th className="pb-2 font-medium text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentSessions.map((s, i) => (
                <tr key={i} className="border-b border-border/50 last:border-b-0">
                  <td className="py-2 font-mono text-xs text-text-secondary">
                    {new Date(s.startedAt).toLocaleDateString()} {new Date(s.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      s.mode === "zombie" ? "bg-correct/10 text-correct" :
                      s.mode === "pong" ? "bg-info/10 text-info" :
                      s.mode === "word" ? "bg-accent/10 text-accent" : "bg-info/10 text-info"
                    }`}>
                      {s.mode ?? "word"}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono">{Math.round(s.avgWpm)} WPM</td>
                  <td className={`py-2 text-right font-mono ${
                    s.accuracy >= 0.95 ? "text-correct" : s.accuracy >= 0.8 ? "text-yellow-400" : "text-incorrect"
                  }`}>
                    {(s.accuracy * 100).toFixed(0)}%
                  </td>
                  <td className="py-2 text-right font-mono text-text-dim">
                    {formatDuration(s.startedAt, s.endedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Back button */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-6 py-2.5 rounded-lg border border-border bg-surface-raised text-text-secondary font-medium text-sm hover:border-accent/50 transition-colors"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
