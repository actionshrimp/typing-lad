import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import type { Engine, ParagraphResult } from "@typing-lad/core";
import { LEVEL_NAMES } from "@typing-lad/core";

const PARAGRAPH_SIZE = 15;

interface ParagraphProps {
  engine: Engine;
  onDone: (result: ParagraphResult) => void;
  onEscape: () => void;
}

export function Paragraph({ engine, onDone, onEscape }: ParagraphProps) {
  const [words, setWords] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const startRef = useRef<number>(Date.now());
  const startISORef = useRef<string>(new Date().toISOString());
  const [started, setStarted] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!started) {
      const generated = engine.generateParagraph(PARAGRAPH_SIZE);
      setWords(generated);
      startRef.current = Date.now();
      startISORef.current = new Date().toISOString();
      setStarted(true);
    }
  }, [started, engine]);

  // Timer for running WPM
  useEffect(() => {
    if (!started) return;
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current);
    }, 500);
    return () => clearInterval(interval);
  }, [started]);

  useInput((input, key) => {
    if (key.escape) {
      onEscape();
      return;
    }

    if (key.ctrl || key.meta) return;
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
    if (key.return || key.tab) return;

    if (words.length === 0) return;

    let newTyped = typed;

    if (key.backspace || key.delete) {
      if (newTyped.length > 0) {
        newTyped = newTyped.slice(0, -1);
      }
    } else {
      newTyped = typed + input;
    }

    setTyped(newTyped);

    // Build the full target string (words joined by spaces)
    const targetStr = words.join(" ");

    // Auto-submit when typed length >= target length
    if (newTyped.length >= targetStr.length) {
      const duration = Date.now() - startRef.current;
      const result = engine.submitParagraph(words, newTyped, duration, startISORef.current);
      onDone(result);
    }
  });

  if (words.length === 0) {
    return (
      <Box paddingTop={1} paddingLeft={2}>
        <Text>Loading paragraph...</Text>
      </Box>
    );
  }

  const targetStr = words.join(" ");
  const levelName = LEVEL_NAMES[engine.currentLevel] || "Unknown";

  // Calculate current word index
  const typedSoFar = typed;
  const typedWords = typedSoFar.split(" ");
  const currentWordIndex = Math.min(typedWords.length, words.length);

  // Running WPM (only show after 1 second)
  const showWpm = elapsedMs > 1000;
  const runningWpm = showWpm
    ? Math.round((typed.length / 5) / (elapsedMs / 60000))
    : 0;

  return (
    <Box flexDirection="column" paddingTop={1} paddingLeft={2}>
      {/* Header */}
      <Text bold color="#7D56F4">
        Paragraph — Level: {levelName}
      </Text>

      <Box marginTop={1} />

      {/* Per-char rendering of the paragraph */}
      <Box flexWrap="wrap">
        {targetStr.split("").map((ch, i) => {
          let color: string | undefined;
          let backgroundColor: string | undefined;
          let dimColor = false;

          if (i < typed.length) {
            if (typed[i] === ch) {
              color = "#04B575";
            } else {
              color = "#FF4672";
            }
          } else if (i === typed.length) {
            color = "#FFFFFF";
            backgroundColor = "#7D56F4";
          } else {
            color = "#626262";
            dimColor = true;
          }

          return (
            <Text
              key={i}
              color={color}
              backgroundColor={backgroundColor}
              dimColor={dimColor}
            >
              {ch}
            </Text>
          );
        })}
      </Box>

      <Box marginTop={1} />

      {/* Word count and WPM */}
      <Box>
        <Text>
          Word {currentWordIndex}/{words.length}
          {showWpm && (
            <Text> {"\u2022"} {runningWpm} WPM</Text>
          )}
        </Text>
      </Box>

      <Box marginTop={1} />

      {/* Help text */}
      <Text color="#626262" dimColor>
        Type the paragraph above {"\u2022"} Backspace to correct {"\u2022"} Esc to cancel
      </Text>
    </Box>
  );
}
