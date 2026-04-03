import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Store,
  Engine,
  type SessionResult,
  type ParagraphResult,
} from "@typing-lad/core";
import { exportToFile, importFromFile, saveToLocalStorage } from "../persistence";
import { Layout, type NavTab, type ActiveMode } from "./Layout";
import { Menu } from "./Menu";
import { Practice } from "./Practice";
import { Paragraph } from "./Paragraph";
import { Summary } from "./Summary";
import { Stats } from "./Stats";

type ViewState = "home" | "practice" | "paragraph" | "summary" | "stats" | "save-restore";

interface AppProps {
  store: Store;
  onSave: () => void;
}

export function App({ store, onSave }: AppProps) {
  const [view, setView] = useState<ViewState>("home");
  const [engine, setEngine] = useState<Engine>(() => new Engine(store));
  const [sessionResult, setSessionResult] = useState<SessionResult | undefined>();
  const [paragraphResult, setParagraphResult] = useState<ParagraphResult | undefined>();

  const viewRef = useRef(view);
  viewRef.current = view;

  const startPractice = useCallback(
    (mode: "word" | "paragraph") => {
      const newEngine = new Engine(store);
      setEngine(newEngine);

      // Check for forced mode (testing support)
      const forceMode = (window as any).__forceMode;
      if (forceMode === "paragraph") {
        setView("paragraph");
        return;
      }

      setView(mode === "paragraph" ? "paragraph" : "practice");
    },
    [store]
  );

  const handleNavigate = useCallback(
    (tab: NavTab) => {
      if (tab === "home") setView("home");
      else if (tab === "practice") startPractice("word");
      else if (tab === "stats") setView("stats");
      else if (tab === "save-restore") setView("save-restore");
    },
    [startPractice]
  );

  const handleModeSelect = useCallback(
    (mode: "word" | "paragraph") => {
      startPractice(mode);
    },
    [startPractice]
  );

  const handleMenuSelect = useCallback(
    (item: "practice" | "stats") => {
      if (item === "stats") {
        setView("stats");
        return;
      }
      startPractice("word");
    },
    [startPractice]
  );

  const handlePracticeDone = useCallback(
    (result: SessionResult) => {
      onSave();
      setSessionResult(result);
      setParagraphResult(undefined);
      setView("summary");
    },
    [onSave]
  );

  const handleParagraphDone = useCallback(
    (result: ParagraphResult) => {
      onSave();
      setParagraphResult(result);
      setSessionResult(undefined);
      setView("summary");
    },
    [onSave]
  );

  const handleEscape = useCallback(() => {
    onSave();
    setView("home");
  }, [onSave]);

  const handleSummaryDone = useCallback(() => {
    setView("home");
  }, []);

  const handleSummaryRetry = useCallback(
    (mode: "word" | "paragraph") => {
      startPractice(mode);
    },
    [startPractice]
  );

  const handleStatsBack = useCallback(() => {
    setView("home");
  }, []);

  const handleExport = useCallback(async () => {
    await exportToFile(store.getData());
  }, [store]);

  const handleImport = useCallback(async () => {
    const data = await importFromFile();
    if (data) {
      store.loadData(data);
      saveToLocalStorage(data);
      setEngine(new Engine(store));
      setView("home");
    }
  }, [store]);

  // Global Escape key handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const currentView = viewRef.current;
        if (currentView === "stats" || currentView === "save-restore") {
          setView("home");
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const getActiveTab = (): NavTab => {
    if (view === "practice" || view === "paragraph") return "practice";
    if (view === "stats") return "stats";
    if (view === "save-restore") return "save-restore";
    return "home";
  };

  const getActiveMode = (): ActiveMode => {
    if (view === "practice") return "word";
    if (view === "paragraph") return "paragraph";
    return null;
  };

  return (
    <Layout
      activeTab={getActiveTab()}
      activeMode={getActiveMode()}
      onNavigate={handleNavigate}
      onModeSelect={handleModeSelect}
    >
      {view === "home" && (
        <Menu
          onSelect={handleMenuSelect}
          onStartPractice={startPractice}
          onExport={handleExport}
          onImport={handleImport}
        />
      )}

      {view === "practice" && (
        <Practice
          engine={engine}
          onDone={handlePracticeDone}
          onEscape={handleEscape}
        />
      )}

      {view === "paragraph" && (
        <Paragraph
          engine={engine}
          onDone={handleParagraphDone}
          onEscape={handleEscape}
        />
      )}

      {view === "summary" && (
        <Summary
          store={store}
          sessionResult={sessionResult}
          paragraphResult={paragraphResult}
          onContinue={handleSummaryDone}
          onRetry={handleSummaryRetry}
          onExport={handleExport}
        />
      )}

      {view === "stats" && (
        <Stats
          store={store}
          onBack={handleStatsBack}
          onExport={handleExport}
          onImport={handleImport}
        />
      )}

      {view === "save-restore" && (
        <div className="max-w-2xl">
          <div className="mb-6">
            <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-1">Data Management</div>
            <h1 className="text-2xl font-bold text-text-primary">Save & Restore</h1>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleExport}
              className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border bg-surface-raised hover:border-accent/50 transition-colors"
            >
              <span className="material-symbols-outlined text-3xl text-accent">download</span>
              <span className="text-sm font-medium">Save to File</span>
              <span className="text-xs text-text-dim">Export progress as JSON</span>
            </button>
            <button
              onClick={handleImport}
              className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border bg-surface-raised hover:border-info/50 transition-colors"
            >
              <span className="material-symbols-outlined text-3xl text-info">upload</span>
              <span className="text-sm font-medium">Restore from File</span>
              <span className="text-xs text-text-dim">Import saved JSON data</span>
            </button>
          </div>
          <p className="mt-4 text-xs text-text-dim">Press Escape to return home.</p>
        </div>
      )}
    </Layout>
  );
}
