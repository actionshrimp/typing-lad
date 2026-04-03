import React from "react";
import { Box, Text, useInput } from "ink";
import type { SessionResult, ParagraphResult } from "@typing-lad/core";

interface SummaryProps {
  sessionResult?: SessionResult;
  paragraphResult?: ParagraphResult;
  onContinue: () => void;
}

function formatDuration(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const seconds = Math.round((end - start) / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function accuracyColor(accuracy: number): string {
  if (accuracy >= 0.95) return "#04B575";
  if (accuracy >= 0.80) return "#FFD700";
  return "#FF4672";
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <Box>
      <Box width={20}>
        <Text bold>{label}</Text>
      </Box>
      <Text color={valueColor}>{value}</Text>
    </Box>
  );
}

export function Summary({ sessionResult, paragraphResult, onContinue }: SummaryProps) {
  useInput((_input, key) => {
    if (key.return) {
      onContinue();
    }
  });

  if (sessionResult) {
    const acc = sessionResult.accuracy;
    const duration = formatDuration(sessionResult.startedAt, sessionResult.endedAt);

    return (
      <Box flexDirection="column" paddingTop={1} paddingLeft={2}>
        <Text bold color="#7D56F4">
          Session Complete!
        </Text>

        <Box marginTop={1} flexDirection="column">
          <Row label="Words Practiced" value={String(sessionResult.wordsPracticed)} />
          <Row label="New Words" value={String(sessionResult.newWords)} />
          <Row label="Average WPM" value={String(Math.round(sessionResult.avgWpm))} />
          <Row
            label="Accuracy"
            value={`${Math.round(acc * 100)}%`}
            valueColor={accuracyColor(acc)}
          />
          <Row label="Duration" value={duration} />
        </Box>

        <Box marginTop={1}>
          <Text color="#626262" dimColor>
            Press Enter to return to menu
          </Text>
        </Box>
      </Box>
    );
  }

  if (paragraphResult) {
    const acc = paragraphResult.accuracy;
    const duration = formatDuration(paragraphResult.startedAt, paragraphResult.endedAt);

    return (
      <Box flexDirection="column" paddingTop={1} paddingLeft={2}>
        <Text bold color="#7D56F4">
          Paragraph Complete!
        </Text>

        <Box marginTop={1} flexDirection="column">
          <Row
            label="Words Correct"
            value={`${paragraphResult.wordsCorrect}/${paragraphResult.wordsTotal}`}
          />
          <Row label="WPM" value={String(Math.round(paragraphResult.wpm))} />
          <Row
            label="Accuracy"
            value={`${Math.round(acc * 100)}%`}
            valueColor={accuracyColor(acc)}
          />
          <Row label="Duration" value={duration} />
        </Box>

        <Box marginTop={1}>
          <Text color="#626262" dimColor>
            Press Enter to return to menu
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box paddingTop={1} paddingLeft={2}>
      <Text>No results to display.</Text>
    </Box>
  );
}
