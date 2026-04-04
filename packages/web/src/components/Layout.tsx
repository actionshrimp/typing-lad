import React from "react";

export type NavTab = "home" | "practice" | "stats" | "save-restore";
export type ActiveMode = "word" | "paragraph" | "zombie" | "pong" | null;

type SyncStatus = "none" | "synced" | "needs-permission" | "unavailable";

interface LayoutProps {
  activeTab: NavTab;
  activeMode: ActiveMode;
  onNavigate: (tab: NavTab) => void;
  onModeSelect: (mode: "word" | "paragraph" | "zombie" | "pong" | "pong-multi") => void;
  syncStatus: SyncStatus;
  onEnableSync: () => void;
  onDisableSync: () => void;
  children: React.ReactNode;
}

export function Layout({ activeTab, activeMode, onNavigate, onModeSelect, syncStatus, onEnableSync, onDisableSync, children }: LayoutProps) {
  const navItems: { label: string; tab: NavTab }[] = [
    { label: "Practice", tab: "practice" },
    { label: "Stats", tab: "stats" },
    { label: "Save | Restore", tab: "save-restore" },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top Nav */}
      <header className="flex items-center justify-between px-6 h-14 border-b border-border bg-surface-raised shrink-0">
        <button
          onClick={() => onNavigate("home")}
          className="text-sm font-bold tracking-[0.2em] text-accent hover:text-accent/80 transition-colors"
        >
          TYPING LAD
        </button>

        <nav className="flex gap-1">
          {navItems.map(({ label, tab }) => (
            <button
              key={tab}
              onClick={() => onNavigate(tab)}
              className={`px-4 py-2 text-xs font-medium tracking-wider uppercase transition-colors border-b-2 ${
                activeTab === tab
                  ? "text-accent border-accent"
                  : "text-text-secondary border-transparent hover:text-text-primary hover:border-border"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Sync status indicator */}
        {syncStatus === "synced" ? (
          <button
            onClick={onDisableSync}
            className="flex items-center gap-1.5 text-xs text-correct hover:text-correct/80 transition-colors"
            title="Auto-syncing to local file. Click to disconnect."
          >
            <span className="material-symbols-outlined text-sm">sync</span>
            File Sync
          </button>
        ) : syncStatus === "unavailable" ? (
          <div className="flex items-center gap-1.5 text-xs text-text-dim">
            <span className="material-symbols-outlined text-sm">storage</span>
            localStorage
          </div>
        ) : (
          <button
            onClick={onEnableSync}
            className="flex items-center gap-1.5 text-xs text-text-dim hover:text-accent transition-colors"
            title="Enable auto file sync (Chrome)"
          >
            <span className="material-symbols-outlined text-sm">sync_disabled</span>
            File Sync Off
          </button>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-48 border-r border-border bg-surface-raised shrink-0 flex flex-col py-6 px-4">
          <div className="text-[10px] font-semibold tracking-[0.3em] text-text-dim uppercase mb-4">
            Modes
          </div>
          <button
            onClick={() => onModeSelect("word")}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-l transition-colors mb-1 text-left ${
              activeMode === "word"
                ? "text-accent bg-accent-dim border-r-2 border-accent"
                : "text-text-secondary hover:text-text-primary hover:bg-white/5"
            }`}
          >
            <span className="material-symbols-outlined text-base">keyboard</span>
            Word Mode
          </button>
          <button
            onClick={() => onModeSelect("paragraph")}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-l transition-colors mb-1 text-left ${
              activeMode === "paragraph"
                ? "text-accent bg-accent-dim border-r-2 border-accent"
                : "text-text-secondary hover:text-text-primary hover:bg-white/5"
            }`}
          >
            <span className="material-symbols-outlined text-base">article</span>
            Paragraph Mode
          </button>
          <button
            onClick={() => onModeSelect("zombie")}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-l transition-colors mb-1 text-left ${
              activeMode === "zombie"
                ? "text-correct bg-correct/10 border-r-2 border-correct"
                : "text-text-secondary hover:text-text-primary hover:bg-white/5"
            }`}
          >
            <span className="material-symbols-outlined text-base">skull</span>
            Zombie Mode
          </button>
          <button
            onClick={() => onModeSelect("pong")}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-l transition-colors mb-1 text-left ${
              activeMode === "pong"
                ? "text-info bg-info/10 border-r-2 border-info"
                : "text-text-secondary hover:text-text-primary hover:bg-white/5"
            }`}
          >
            <span className="material-symbols-outlined text-base">sports_tennis</span>
            Pong Mode
          </button>
          <button
            onClick={() => onModeSelect("pong-multi")}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-l transition-colors text-left ${
              activeMode === "pong"
                ? "text-info/60 hover:text-info hover:bg-info/5"
                : "text-text-secondary hover:text-text-primary hover:bg-white/5"
            }`}
          >
            <span className="material-symbols-outlined text-base">group</span>
            Multiplayer
          </button>
        </aside>

        {/* Main Area */}
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between px-6 h-10 border-t border-border bg-surface-raised text-[11px] text-text-dim shrink-0">
        <span>&copy; TYPING LAD</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-correct"></span>
          System Online
        </span>
        <a
          href="https://github.com/actionshrimp/typing-lad"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text-secondary transition-colors"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
