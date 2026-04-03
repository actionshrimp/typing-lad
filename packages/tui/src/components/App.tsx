import React, { useState, useCallback } from "react";
import { useApp, useInput } from "ink";
import type { Store, Engine, SessionResult, ParagraphResult } from "@typing-lad/core";
import { Menu } from "./Menu.js";
import { Practice } from "./Practice.js";
import { Paragraph } from "./Paragraph.js";
import { Summary } from "./Summary.js";
import { Stats } from "./Stats.js";

type ViewState = "menu" | "practice" | "paragraph" | "summary" | "stats";

interface AppProps {
  store: Store;
  engine: Engine;
  onSave: () => void;
}

export function App({ store, engine, onSave }: AppProps) {
  const { exit } = useApp();
  const [view, setView] = useState<ViewState>("menu");
  const [lastSessionResult, setLastSessionResult] = useState<SessionResult | undefined>();
  const [lastParagraphResult, setLastParagraphResult] = useState<ParagraphResult | undefined>();

  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      exit();
    }
  });

  const handleMenuSelect = useCallback((item: "practice" | "stats" | "quit") => {
    if (item === "quit") {
      exit();
      return;
    }
    if (item === "stats") {
      setView("stats");
      return;
    }
    // 70% practice, 30% paragraph
    if (Math.random() < 0.7) {
      setView("practice");
    } else {
      setView("paragraph");
    }
  }, [exit]);

  const handlePracticeDone = useCallback((result: SessionResult) => {
    setLastSessionResult(result);
    setLastParagraphResult(undefined);
    onSave();
    setView("summary");
  }, [onSave]);

  const handleParagraphDone = useCallback((result: ParagraphResult) => {
    setLastParagraphResult(result);
    setLastSessionResult(undefined);
    onSave();
    setView("summary");
  }, [onSave]);

  const handleEscape = useCallback(() => {
    setView("menu");
  }, []);

  const handleSummaryClose = useCallback(() => {
    setView("menu");
  }, []);

  const handleStatsBack = useCallback(() => {
    setView("menu");
  }, []);

  switch (view) {
    case "menu":
      return <Menu onSelect={handleMenuSelect} />;
    case "practice":
      return <Practice engine={engine} onDone={handlePracticeDone} onEscape={handleEscape} />;
    case "paragraph":
      return <Paragraph engine={engine} onDone={handleParagraphDone} onEscape={handleEscape} />;
    case "summary":
      return (
        <Summary
          sessionResult={lastSessionResult}
          paragraphResult={lastParagraphResult}
          onContinue={handleSummaryClose}
        />
      );
    case "stats":
      return <Stats store={store} onBack={handleStatsBack} />;
  }
}
