import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import {
  Store,
  Engine,
  type SessionResult,
  type ParagraphResult,
} from "@typing-lad/core";
import {
  exportToFile,
  importFromFile,
  saveToLocalStorage,
  saveToFile,
  enableFileSync,
  disableFileSync,
  requestFileSyncPermission,
  hasFileSystemAccess,
} from "../persistence";
import { Layout, type NavTab, type ActiveMode } from "./Layout";
import type { PongNetLike } from "../pong/net";
import { Menu } from "./Menu";
import { Practice } from "./Practice";
import { Paragraph } from "./Paragraph";
import { Summary } from "./Summary";
import { Stats } from "./Stats";

type ViewState = "home" | "practice" | "paragraph" | "zombie" | "pong" | "pong-lobby" | "pong-multi" | "summary" | "stats" | "save-restore";

const Zombie = React.lazy(() => import("./Zombie").then((m) => ({ default: m.Zombie })));
const Pong = React.lazy(() => import("./Pong").then((m) => ({ default: m.Pong })));
const PongLobby = React.lazy(() => import("./PongLobby").then((m) => ({ default: m.PongLobby })));
const MultiplayerPong = React.lazy(() => import("./MultiplayerPong").then((m) => ({ default: m.MultiplayerPong })));

type SyncStatus = "none" | "synced" | "needs-permission" | "unavailable";

interface AppProps {
  store: Store;
  onSave: () => void;
  initialFileHandle: FileSystemFileHandle | null;
}

export function App({ store, onSave, initialFileHandle }: AppProps) {
  const [view, setView] = useState<ViewState>("home");
  const [engine, setEngine] = useState<Engine>(() => new Engine(store));
  const [sessionResult, setSessionResult] = useState<SessionResult | undefined>();
  const [paragraphResult, setParagraphResult] = useState<ParagraphResult | undefined>();
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(initialFileHandle);
  const [multiNet, setMultiNet] = useState<PongNetLike | null>(null);
  const [isPlayer1, setIsPlayer1] = useState(true);

  const viewRef = useRef(view);
  viewRef.current = view;
  const fileHandleRef = useRef(fileHandle);
  fileHandleRef.current = fileHandle;

  const syncStatus: SyncStatus = !hasFileSystemAccess()
    ? "unavailable"
    : fileHandle
    ? "synced"
    : "none";

  // Save to both localStorage and file (if synced)
  const saveAll = useCallback(() => {
    const data = store.getData();
    saveToLocalStorage(data);
    if (fileHandleRef.current) {
      saveToFile(fileHandleRef.current, data);
    }
  }, [store]);

  const handleEnableSync = useCallback(async () => {
    const handle = await enableFileSync();
    if (handle) {
      setFileHandle(handle);
      // Write current data to the new file immediately
      await saveToFile(handle, store.getData());
    }
  }, [store]);

  const handleDisableSync = useCallback(async () => {
    await disableFileSync();
    setFileHandle(null);
  }, []);

  const handleRequestPermission = useCallback(async () => {
    const handle = await requestFileSyncPermission();
    if (handle) setFileHandle(handle);
  }, []);

  const startPractice = useCallback(
    (mode: "word" | "paragraph" | "zombie" | "pong" | "random") => {
      const newEngine = new Engine(store);
      setEngine(newEngine);

      const forceMode = (window as any).__forceMode as string | undefined;
      if (forceMode === "paragraph") {
        setView("paragraph");
        return;
      }
      if (forceMode === "word") {
        setView("practice");
        return;
      }

      if (mode === "zombie") {
        setView("zombie");
      } else if (mode === "pong") {
        setView("pong");
      } else if (mode === "random") {
        const r = Math.random();
        setView(r < 0.4 ? "practice" : r < 0.65 ? "paragraph" : r < 0.85 ? "zombie" : "pong");
      } else {
        setView(mode === "paragraph" ? "paragraph" : "practice");
      }
    },
    [store]
  );

  const handleNavigate = useCallback(
    (tab: NavTab) => {
      if (tab === "home") setView("home");
      else if (tab === "practice") startPractice("random");
      else if (tab === "stats") setView("stats");
      else if (tab === "save-restore") setView("save-restore");
    },
    [startPractice]
  );

  const handleModeSelect = useCallback(
    (mode: "word" | "paragraph" | "zombie" | "pong" | "pong-multi") => {
      if (mode === "pong-multi") {
        setView("pong-lobby");
        return;
      }
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
      startPractice("random");
    },
    [startPractice]
  );

  const handlePracticeDone = useCallback(
    (result: SessionResult) => {
      saveAll();
      setSessionResult(result);
      setParagraphResult(undefined);
      setView("summary");
    },
    [saveAll]
  );

  const handleZombieDone = useCallback(
    (result: SessionResult) => {
      saveAll();
      setSessionResult(result);
      setParagraphResult(undefined);
      setView("summary");
    },
    [saveAll]
  );

  const handlePongDone = useCallback(
    (result: SessionResult) => {
      saveAll();
      setSessionResult(result);
      setParagraphResult(undefined);
      setView("summary");
    },
    [saveAll]
  );

  const handleMultiplayerReady = useCallback(
    (opts: { net: PongNetLike; isPlayer1: boolean }) => {
      const newEngine = new Engine(store);
      setEngine(newEngine);
      setMultiNet(opts.net);
      setIsPlayer1(opts.isPlayer1);
      setView("pong-multi");
    },
    [store]
  );

  const handleMultiDone = useCallback(
    (result: SessionResult) => {
      saveAll();
      setMultiNet(null);
      setSessionResult(result);
      setParagraphResult(undefined);
      setView("summary");
    },
    [saveAll]
  );

  const handleParagraphDone = useCallback(
    (result: ParagraphResult) => {
      saveAll();
      setParagraphResult(result);
      setSessionResult(undefined);
      setView("summary");
    },
    [saveAll]
  );

  const handleEscape = useCallback(() => {
    saveAll();
    setView("home");
  }, [saveAll]);

  const handleSummaryDone = useCallback(() => {
    setView("home");
  }, []);

  const handleSummaryRetry = useCallback(() => {
    startPractice("random");
  }, [startPractice]);

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
      if (fileHandleRef.current) {
        await saveToFile(fileHandleRef.current, data);
      }
      setEngine(new Engine(store));
      setView("home");
    }
  }, [store]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const currentView = viewRef.current;
        if (currentView === "stats" || currentView === "save-restore") {
          setView("home");
        }
        // zombie handles ESC internally via onEscape prop
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const getActiveTab = (): NavTab => {
    if (view === "practice" || view === "paragraph" || view === "zombie" || view === "pong" || view === "pong-lobby" || view === "pong-multi") return "practice";
    if (view === "stats") return "stats";
    if (view === "save-restore") return "save-restore";
    return "home";
  };

  const getActiveMode = (): ActiveMode => {
    if (view === "practice") return "word";
    if (view === "paragraph") return "paragraph";
    if (view === "zombie") return "zombie";
    if (view === "pong" || view === "pong-lobby" || view === "pong-multi") return "pong";
    return null;
  };

  return (
    <Layout
      activeTab={getActiveTab()}
      activeMode={getActiveMode()}
      onNavigate={handleNavigate}
      onModeSelect={handleModeSelect}
      syncStatus={syncStatus}
      onEnableSync={handleEnableSync}
      onDisableSync={handleDisableSync}
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

      {view === "zombie" && (
        <Suspense fallback={<div className="text-text-dim text-sm">Loading Zombie Mode...</div>}>
          <Zombie
            engine={engine}
            onDone={handleZombieDone}
            onEscape={handleEscape}
          />
        </Suspense>
      )}

      {view === "pong" && (
        <Suspense fallback={<div className="text-text-dim text-sm">Loading Pong Mode...</div>}>
          <Pong
            engine={engine}
            onDone={handlePongDone}
            onEscape={handleEscape}
          />
        </Suspense>
      )}

      {view === "pong-lobby" && (
        <Suspense fallback={<div className="text-text-dim text-sm">Loading Multiplayer...</div>}>
          <PongLobby
            onReady={handleMultiplayerReady}
            onCancel={handleEscape}
          />
        </Suspense>
      )}

      {view === "pong-multi" && multiNet && (
        <Suspense fallback={<div className="text-text-dim text-sm">Loading Multiplayer Pong...</div>}>
          <MultiplayerPong
            engine={engine}
            isPlayer1={isPlayer1}
            net={multiNet}
            onDone={handleMultiDone}
            onEscape={handleEscape}
          />
        </Suspense>
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

          {/* File sync section */}
          {syncStatus !== "unavailable" && (
            <div className="mt-6 p-4 rounded-lg border border-border bg-surface-raised">
              <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-3">
                Auto File Sync (Chrome)
              </div>
              {syncStatus === "synced" ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-correct">
                    <span className="material-symbols-outlined text-base">sync</span>
                    Syncing to local file
                  </div>
                  <button
                    onClick={handleDisableSync}
                    className="text-xs text-text-dim hover:text-incorrect transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-text-secondary">
                    Auto-save progress to a local JSON file after every session.
                  </p>
                  <button
                    onClick={handleEnableSync}
                    className="px-3 py-1.5 rounded border border-accent/50 text-accent text-xs font-medium hover:bg-accent-dim transition-colors whitespace-nowrap ml-4"
                  >
                    Choose File
                  </button>
                </div>
              )}
            </div>
          )}

          <p className="mt-4 text-xs text-text-dim">Press Escape to return home.</p>
        </div>
      )}
    </Layout>
  );
}
