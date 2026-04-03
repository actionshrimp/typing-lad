import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import type { Engine, AttemptResult, SessionResult } from "@typing-lad/core";
import { LEVEL_NAMES } from "@typing-lad/core";

interface PracticeProps {
  engine: Engine;
  onDone: (result: SessionResult) => void;
  onEscape: () => void;
}

export function Practice({ engine, onDone, onEscape }: PracticeProps) {
  const [target, setTarget] = useState("");
  const [typed, setTyped] = useState("");
  const [firstTyped, setFirstTyped] = useState<string | null>(null);
  const wordStartRef = useRef<number>(Date.now());
  const [lastResult, setLastResult] = useState<AttemptResult | null>(null);
  const [started, setStarted] = useState(false);

  const loadNextWord = useCallback(() => {
    const word = engine.nextWord();
    setTarget(word);
    setTyped("");
    setFirstTyped(null);
    wordStartRef.current = Date.now();
  }, [engine]);

  useEffect(() => {
    if (!started) {
      engine.startSession();
      setStarted(true);
      loadNextWord();
    }
  }, [started, engine, loadNextWord]);

  useInput((input, key) => {
    if (key.escape) {
      const result = engine.endSession();
      onEscape();
      return;
    }

    // Ignore control keys except for regular character input
    if (key.ctrl || key.meta) return;
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
    if (key.return || key.tab || key.backspace || key.delete) return;

    if (!target) return;

    const newTyped = typed + input;
    const pos = newTyped.length - 1;

    // Check for mistake at the current position
    if (pos < target.length && newTyped[pos] !== target[pos]) {
      // Mistake: save firstTyped for scoring if this is the first attempt
      if (firstTyped === null) {
        setFirstTyped(newTyped);
      }
      setTyped("");
      wordStartRef.current = Date.now();
      return;
    }

    setTyped(newTyped);

    // Check if word is complete
    if (newTyped.length === target.length) {
      const duration = Date.now() - wordStartRef.current;
      // Use firstTyped for scoring if there were retries
      const scoringTyped = firstTyped !== null ? firstTyped : newTyped;
      const result = engine.submitAttempt(target, scoringTyped, duration);
      setLastResult(result);

      if (engine.sessionDone()) {
        const sessionResult = engine.endSession();
        onDone(sessionResult);
      } else {
        loadNextWord();
      }
    }
  });

  const wordsCompleted = engine.wordsCompleted;
  const sessionSize = engine.sessionSize;
  const levelName = LEVEL_NAMES[engine.currentLevel] || "Unknown";

  // Progress bar
  const barWidth = 20;
  const filled = Math.round((wordsCompleted / sessionSize) * barWidth);
  const empty = barWidth - filled;
  const progressBar = "\u2588".repeat(filled) + "\u2591".repeat(empty);

  return (
    <Box flexDirection="column" paddingTop={1} paddingLeft={2}>
      {/* Header */}
      <Text bold color="#7D56F4">
        Practice — Level: {levelName}
      </Text>

      <Box marginTop={1} />

      {/* Target word with per-char rendering */}
      <Box>
        {target.split("").map((ch, i) => {
          let color: string | undefined;
          let backgroundColor: string | undefined;
          let strikethrough = false;
          let dimColor = false;

          if (i < typed.length) {
            if (typed[i] === ch) {
              color = "#04B575";
            } else {
              color = "#FF4672";
              strikethrough = true;
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
              strikethrough={strikethrough}
              dimColor={dimColor}
            >
              {ch}
            </Text>
          );
        })}
      </Box>

      <Box marginTop={1} />

      {/* Progress bar */}
      <Box>
        <Text>
          [{progressBar}] {wordsCompleted}/{sessionSize} words
        </Text>
      </Box>

      {/* Last result feedback */}
      {lastResult && (
        <Box marginTop={1}>
          <Text>
            <Text color={lastResult.isCorrect ? "#04B575" : "#FF4672"}>
              {lastResult.isCorrect ? "\u2713" : "\u2717"}
            </Text>
            {" "}
            <Text bold>{lastResult.target}</Text>
            {" "}
            <Text>{Math.round(lastResult.wpm)} WPM</Text>
            {" "}
            <Text>{Math.round(lastResult.accuracy * 100)}%</Text>
          </Text>
        </Box>
      )}

      <Box marginTop={1} />

      {/* Help text */}
      <Text color="#626262" dimColor>
        Type the word above {"\u2022"} Mistakes restart the word {"\u2022"} Esc to end session
      </Text>
    </Box>
  );
}
