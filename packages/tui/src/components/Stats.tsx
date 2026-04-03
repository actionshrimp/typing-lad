import React from "react";
import { Box, Text, useInput } from "ink";
import { LEVEL_NAMES, Level, wordsByLevel } from "@typing-lad/core";
import type { Store } from "@typing-lad/core";

interface StatsProps {
  store: Store;
  onBack: () => void;
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <Box>
      <Box width={22}>
        <Text bold>{label}</Text>
      </Box>
      <Text color={valueColor}>{value}</Text>
    </Box>
  );
}

function formatTime(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function accuracyColor(accuracy: number): string {
  if (accuracy >= 0.95) return "#04B575";
  if (accuracy >= 0.80) return "#FFD700";
  return "#FF4672";
}

export function Stats({ store, onBack }: StatsProps) {
  const stats = store.getStats();

  useInput((_input, key) => {
    if (key.escape || key.return) {
      onBack();
    }
  });

  const levels: Level[] = [Level.HomeRow, Level.TopRow, Level.BottomRow, Level.FullAlpha];

  return (
    <Box flexDirection="column" paddingTop={1} paddingLeft={2}>
      <Text bold color="#7D56F4">
        Statistics
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Row label="Current Level" value={LEVEL_NAMES[stats.currentLevel]} />
        <Row label="Total Sessions" value={String(stats.totalSessions)} />
        <Row label="Total Words" value={String(stats.totalWords)} />
        <Row label="Words Mastered" value={String(stats.wordsMastered)} />
        <Row
          label="Average WPM"
          value={stats.totalSessions > 0 ? String(Math.round(stats.avgWpm)) : "-"}
        />
        <Row
          label="Average Accuracy"
          value={stats.totalSessions > 0 ? `${Math.round(stats.avgAccuracy * 100)}%` : "-"}
          valueColor={stats.totalSessions > 0 ? accuracyColor(stats.avgAccuracy) : undefined}
        />
        <Row
          label="Best WPM"
          value={stats.bestWpm > 0 ? String(Math.round(stats.bestWpm)) : "-"}
        />
        <Row
          label="Streak"
          value={stats.streakDays > 0 ? `${stats.streakDays} day${stats.streakDays !== 1 ? "s" : ""}` : "-"}
        />
        <Row
          label="Practice Time"
          value={stats.totalPracticeTimeMs > 0 ? formatTime(stats.totalPracticeTimeMs) : "-"}
        />
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="#00CED1">Per-Level Breakdown</Text>
        <Box marginTop={0} flexDirection="column">
          {levels.map((level) => {
            const total = wordsByLevel(level).length;
            const mastered = stats.wordsPerLevel[level] || 0;
            const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
            return (
              <Box key={level}>
                <Box width={22}>
                  <Text>{LEVEL_NAMES[level]}</Text>
                </Box>
                <Text>
                  {mastered}/{total} ({pct}%)
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="#626262" dimColor>
          Press Esc or Enter to return to menu
        </Text>
      </Box>
    </Box>
  );
}
