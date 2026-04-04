import { type Level, type Word, Level as LevelEnum, allWords, wordsByLevel } from "./words.js";
import { MASTERY_REPS } from "./srs.js";

export interface WordProgress {
  text: string;
  level: Level;
  rank: number;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReview: string | null;
  lastReviewed: string | null;
  timesCorrect: number;
  timesIncorrect: number;
}

export interface SessionRecord {
  startedAt: string;
  endedAt: string;
  wordsPracticed: number;
  avgWpm: number;
  accuracy: number;
  mode: "word" | "paragraph" | "zombie" | "pong";
}

export interface Stats {
  totalSessions: number;
  totalWords: number;
  avgWpm: number;
  avgAccuracy: number;
  wordsMastered: number;
  currentLevel: Level;
  wordsPerLevel: Record<number, number>;
  bestWpm: number;
  totalPracticeTimeMs: number;
  totalErrors: number;
  streakDays: number;
  recentSessions: SessionRecord[];
}

export interface StoreData {
  wordProgress: Record<string, WordProgress>;
  sessions: SessionRecord[];
  keyErrors: Record<string, number>;
}

function defaultProgress(word: Word): WordProgress {
  return {
    text: word.text,
    level: word.level,
    rank: word.rank,
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    nextReview: null,
    lastReviewed: null,
    timesCorrect: 0,
    timesIncorrect: 0,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Store {
  private data: StoreData;
  private wordIndex: Map<string, Word>;

  constructor() {
    this.data = { wordProgress: {}, sessions: [], keyErrors: {} };
    this.wordIndex = new Map();
    for (const w of allWords()) {
      this.wordIndex.set(w.text, w);
    }
  }

  getWordProgress(text: string): WordProgress {
    const existing = this.data.wordProgress[text];
    if (existing) return { ...existing };

    const word = this.wordIndex.get(text);
    if (!word) {
      return {
        text,
        level: LevelEnum.HomeRow,
        rank: 0,
        easeFactor: 2.5,
        intervalDays: 0,
        repetitions: 0,
        nextReview: null,
        lastReviewed: null,
        timesCorrect: 0,
        timesIncorrect: 0,
      };
    }
    return defaultProgress(word);
  }

  updateWordProgress(progress: WordProgress): void {
    this.data.wordProgress[progress.text] = { ...progress };
  }

  getDueWords(now: Date, limit: number): WordProgress[] {
    const nowISO = now.toISOString();
    const due: WordProgress[] = [];

    for (const p of Object.values(this.data.wordProgress)) {
      if (p.nextReview && p.nextReview <= nowISO) {
        due.push({ ...p });
      }
    }

    due.sort((a, b) => (a.nextReview! < b.nextReview! ? -1 : 1));
    return due.slice(0, limit);
  }

  getNewWords(level: Level, limit: number): WordProgress[] {
    const levelWords = wordsByLevel(level);
    const result: WordProgress[] = [];

    for (const w of levelWords) {
      if (!(w.text in this.data.wordProgress)) {
        result.push(defaultProgress(w));
        if (result.length >= limit) break;
      }
    }
    return result;
  }

  getRandomPracticedWords(maxLevel: Level, limit: number): WordProgress[] {
    const candidates: WordProgress[] = [];
    for (const p of Object.values(this.data.wordProgress)) {
      if (p.level <= maxLevel && p.repetitions > 0) {
        candidates.push({ ...p });
      }
    }
    return shuffle(candidates).slice(0, limit);
  }

  saveSession(record: SessionRecord): void {
    this.data.sessions.push({ ...record });
  }

  recordKeyError(key: string): void {
    this.data.keyErrors[key] = (this.data.keyErrors[key] ?? 0) + 1;
  }

  getKeyErrors(): Record<string, number> {
    return { ...this.data.keyErrors };
  }

  getStats(): Stats {
    const sessions = this.data.sessions;
    const totalSessions = sessions.length;
    let totalWords = 0;
    let totalWpm = 0;
    let totalAccuracy = 0;
    let bestWpm = 0;
    let totalPracticeTimeMs = 0;

    for (const s of sessions) {
      totalWords += s.wordsPracticed;
      totalWpm += s.avgWpm;
      totalAccuracy += s.accuracy;
      if (s.avgWpm > bestWpm) bestWpm = s.avgWpm;
      const start = new Date(s.startedAt).getTime();
      const end = new Date(s.endedAt).getTime();
      if (!isNaN(start) && !isNaN(end) && end > start) {
        totalPracticeTimeMs += end - start;
      }
    }

    const avgWpm = totalSessions > 0 ? totalWpm / totalSessions : 0;
    const avgAccuracy = totalSessions > 0 ? totalAccuracy / totalSessions : 0;

    let wordsMastered = 0;
    let totalErrors = 0;
    for (const p of Object.values(this.data.wordProgress)) {
      if (p.repetitions >= MASTERY_REPS) wordsMastered++;
      totalErrors += p.timesIncorrect;
    }

    const wordsPerLevel: Record<number, number> = {};
    let currentLevel: Level = LevelEnum.HomeRow;

    for (const level of [LevelEnum.HomeRow, LevelEnum.TopRow, LevelEnum.BottomRow, LevelEnum.FullAlpha]) {
      const total = wordsByLevel(level).length;
      let mastered = 0;
      for (const p of Object.values(this.data.wordProgress)) {
        if (p.level === level && p.repetitions >= MASTERY_REPS) {
          mastered++;
        }
      }
      wordsPerLevel[level] = mastered;

      if (total > 0 && mastered / total >= 0.8 && level < LevelEnum.FullAlpha) {
        currentLevel = (level + 1) as Level;
      }
    }

    // Streak: consecutive days ending today with at least one session
    let streakDays = 0;
    if (sessions.length > 0) {
      const sessionDays = new Set<string>();
      for (const s of sessions) {
        const d = new Date(s.startedAt);
        if (!isNaN(d.getTime())) {
          sessionDays.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
        }
      }
      const today = new Date();
      let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      while (sessionDays.has(`${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`)) {
        streakDays++;
        checkDate = new Date(checkDate.getTime() - 86400000);
      }
    }

    // Recent sessions: last 10, most recent first
    const recentSessions = sessions.slice(-10).reverse().map(s => ({ ...s }));

    return {
      totalSessions,
      totalWords,
      avgWpm,
      avgAccuracy,
      wordsMastered,
      currentLevel,
      wordsPerLevel,
      bestWpm,
      totalPracticeTimeMs,
      totalErrors,
      streakDays,
      recentSessions,
    };
  }

  exportData(): string {
    return JSON.stringify(this.data, null, 2);
  }

  importData(json: string): void {
    const parsed = JSON.parse(json) as StoreData;
    this.data = {
      wordProgress: { ...parsed.wordProgress },
      sessions: [...parsed.sessions],
      keyErrors: { ...(parsed.keyErrors ?? {}) },
    };
  }

  loadData(data: StoreData): void {
    this.data = {
      wordProgress: { ...data.wordProgress },
      sessions: [...data.sessions],
      keyErrors: { ...(data.keyErrors ?? {}) },
    };
  }

  getData(): StoreData {
    return {
      wordProgress: { ...this.data.wordProgress },
      sessions: [...this.data.sessions],
      keyErrors: { ...this.data.keyErrors },
    };
  }
}
