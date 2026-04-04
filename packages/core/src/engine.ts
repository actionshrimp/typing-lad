import { type Level, Level as LevelEnum } from "./words.js";
import type { Store, WordProgress, SessionRecord } from "./store.js";
import { calculateQuality, updateProgress, TARGET_WPM } from "./srs.js";

export const SESSION_SIZE = 20;
export const MASTERY_THRESHOLD = 0.8;

export interface AttemptResult {
  target: string;
  typed: string;
  correct: boolean[];
  wpm: number;
  accuracy: number;
  quality: number;
  isCorrect: boolean;
  wordNumber: number;
}

export interface ParagraphResult {
  words: string[];
  typed: string[];
  perWordCorrect: boolean[];
  wpm: number;
  accuracy: number;
  wordsCorrect: number;
  wordsTotal: number;
  startedAt: string;
  endedAt: string;
}

export interface SessionResult {
  wordsPracticed: number;
  avgWpm: number;
  accuracy: number;
  newWords: number;
  startedAt: string;
  endedAt: string;
  perWordWpm: number[];
  totalErrors: number;
  mode: "word" | "paragraph" | "zombie" | "pong";
}

export class Engine {
  private store: Store;
  private _currentLevel: Level;
  private _sessionSize = SESSION_SIZE;

  private _wordsCompleted = 0;
  private totalWpm = 0;
  private totalAccuracy = 0;
  private _newWords = 0;
  private _startedAt = "";
  private queue: WordProgress[] = [];
  private perWordWpms: number[] = [];
  private sessionErrors = 0;

  constructor(store: Store) {
    this.store = store;
    const stats = store.getStats();
    this._currentLevel = stats.currentLevel;
  }

  get currentLevel(): Level {
    return this._currentLevel;
  }

  get sessionSize(): number {
    return this._sessionSize;
  }

  get wordsCompleted(): number {
    return this._wordsCompleted;
  }

  startSession(): void {
    this._wordsCompleted = 0;
    this.totalWpm = 0;
    this.totalAccuracy = 0;
    this._newWords = 0;
    this._startedAt = new Date().toISOString();
    this.queue = [];
    this.perWordWpms = [];
    this.sessionErrors = 0;
  }

  sessionDone(): boolean {
    return this._wordsCompleted >= this._sessionSize;
  }

  nextWord(avoid?: ReadonlySet<string>): string {
    // Check for exact match, duplicate, or prefix conflict with active words
    const conflicts = (text: string): boolean => {
      if (!avoid) return false;
      if (avoid.has(text)) return true;
      for (const a of avoid) {
        if (text.startsWith(a) || a.startsWith(text)) return true;
      }
      return false;
    };

    // Try queue first, skipping conflicting words
    while (this.queue.length > 0) {
      const w = this.queue.shift()!;
      if (!conflicts(w.text)) return w.text;
    }

    const now = new Date();

    // Try due words first
    const due = this.store.getDueWords(now, 20);
    const filteredDue = avoid ? due.filter((w) => !conflicts(w.text)) : due;
    if (filteredDue.length > 0) {
      this.queue = filteredDue.slice(1);
      return filteredDue[0].text;
    }

    // New words from current level
    const newWords = this.store.getNewWords(this._currentLevel, 20);
    const filteredNew = avoid ? newWords.filter((w) => !conflicts(w.text)) : newWords;
    if (filteredNew.length > 0) {
      this.queue = filteredNew.slice(1);
      return filteredNew[0].text;
    }

    // Try other levels (including below current for more variety)
    for (let level = 1; level <= LevelEnum.FullAlpha; level++) {
      if (level === this._currentLevel) continue;
      const words = this.store.getNewWords(level as Level, 20);
      const filtered = avoid ? words.filter((w) => !conflicts(w.text)) : words;
      if (filtered.length > 0) {
        this.queue = filtered.slice(1);
        return filtered[0].text;
      }
    }

    // All words practiced — re-review earliest due (look 365 days ahead)
    const futureDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const allDue = this.store.getDueWords(futureDate, 20);
    const filteredAll = avoid ? allDue.filter((w) => !conflicts(w.text)) : allDue;
    if (filteredAll.length > 0) {
      this.queue = filteredAll.slice(1);
      return filteredAll[0].text;
    }

    // Absolute fallback: return any word (duplicates possible if pool exhausted)
    if (due.length > 0) return due[0].text;
    if (allDue.length > 0) return allDue[0].text;
    throw new Error("no words available");
  }

  submitAttempt(target: string, typed: string, durationMs: number): AttemptResult {
    const correct: boolean[] = [];
    let matches = 0;
    for (let i = 0; i < target.length; i++) {
      if (i < typed.length && target[i] === typed[i]) {
        correct.push(true);
        matches++;
      } else {
        correct.push(false);
      }
    }

    const accuracy = target.length > 0 ? matches / target.length : 0;
    const durationMin = durationMs / 60000;
    const wpm = durationMin > 0 ? (target.length / 5) / durationMin : 0;
    const wpmRatio = wpm / TARGET_WPM;
    const quality = calculateQuality(accuracy, wpmRatio);
    const isCorrect = typed === target;

    // Record per-char key errors
    for (let i = 0; i < target.length; i++) {
      if (i < typed.length && target[i] !== typed[i]) {
        this.store.recordKeyError(target[i]);
        this.sessionErrors++;
      }
    }

    const now = new Date();
    const prog = this.store.getWordProgress(target);
    const isNew = prog.repetitions === 0 && prog.lastReviewed === null;
    const updated = updateProgress(prog, quality, now);
    this.store.updateWordProgress(updated);

    if (isNew) this._newWords++;

    this._wordsCompleted++;
    this.totalWpm += wpm;
    this.totalAccuracy += accuracy;
    this.perWordWpms.push(wpm);

    // Check level progression
    const stats = this.store.getStats();
    this._currentLevel = stats.currentLevel;

    return {
      target,
      typed,
      correct,
      wpm,
      accuracy,
      quality,
      isCorrect,
      wordNumber: this._wordsCompleted,
    };
  }

  endSession(mode: "word" | "paragraph" | "zombie" | "pong" = "word"): SessionResult {
    const now = new Date().toISOString();
    const result: SessionResult = {
      wordsPracticed: this._wordsCompleted,
      avgWpm: 0,
      accuracy: 0,
      newWords: this._newWords,
      startedAt: this._startedAt,
      endedAt: now,
      perWordWpm: [...this.perWordWpms],
      totalErrors: this.sessionErrors,
      mode,
    };

    if (this._wordsCompleted > 0) {
      result.avgWpm = this.totalWpm / this._wordsCompleted;
      result.accuracy = this.totalAccuracy / this._wordsCompleted;

      const record: SessionRecord = {
        startedAt: this._startedAt,
        endedAt: now,
        wordsPracticed: this._wordsCompleted,
        avgWpm: result.avgWpm,
        accuracy: result.accuracy,
        mode,
      };
      this.store.saveSession(record);
    }

    return result;
  }

  generateParagraph(count: number): string[] {
    const seen = new Set<string>();

    // Pool 1: random previously-practiced words
    const mixWords: string[] = [];
    const practiced = this.store.getRandomPracticedWords(this._currentLevel, count);
    for (const p of practiced) {
      if (!seen.has(p.text)) {
        mixWords.push(p.text);
        seen.add(p.text);
      }
    }

    // Pool 2: SRS-priority words
    const srsWords: string[] = [];
    const now = new Date();
    const due = this.store.getDueWords(now, count);
    for (const w of due) {
      if (!seen.has(w.text)) {
        srsWords.push(w.text);
        seen.add(w.text);
      }
    }

    if (srsWords.length + mixWords.length < count) {
      const newW = this.store.getNewWords(this._currentLevel, count);
      for (const w of newW) {
        if (!seen.has(w.text)) {
          srsWords.push(w.text);
          seen.add(w.text);
        }
        if (srsWords.length + mixWords.length >= count) break;
      }
    }

    // Try other levels if still short
    for (let level = 1; srsWords.length + mixWords.length < count && level <= LevelEnum.FullAlpha; level++) {
      if (level === this._currentLevel) continue;
      const newW = this.store.getNewWords(level as Level, count);
      for (const w of newW) {
        if (!seen.has(w.text)) {
          srsWords.push(w.text);
          seen.add(w.text);
        }
        if (srsWords.length + mixWords.length >= count) break;
      }
    }

    // Interleave randomly
    const result: string[] = [];
    let si = 0, mi = 0;
    while (result.length < count) {
      const haveSRS = si < srsWords.length;
      const haveMix = mi < mixWords.length;
      if (!haveSRS && !haveMix) break;

      if (haveSRS && (!haveMix || Math.random() < 0.5)) {
        result.push(srsWords[si++]);
      } else if (haveMix) {
        result.push(mixWords[mi++]);
      }
    }

    if (result.length === 0) {
      throw new Error("no words available for paragraph");
    }
    return result;
  }

  submitParagraph(
    words: string[],
    typed: string,
    durationMs: number,
    startedAt: string
  ): ParagraphResult {
    const typedWords = typed.trim().split(/\s+/);
    if (typed.trim() === "") typedWords.length = 0;

    const now = new Date();
    let totalTargetChars = 0;
    let correctChars = 0;
    const perWordCorrect: boolean[] = [];
    const typedSlice: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const target = words[i];
      totalTargetChars += target.length;

      const tw = i < typedWords.length ? typedWords[i] : "";
      typedSlice.push(tw);

      const wordCorrect = tw === target;
      perWordCorrect.push(wordCorrect);

      for (let j = 0; j < target.length; j++) {
        if (j < tw.length && target[j] === tw[j]) {
          correctChars++;
        } else if (j < tw.length) {
          // Record per-char key errors
          this.store.recordKeyError(target[j]);
        }
      }

      // Update SRS per word
      let wordAccuracy = 0;
      if (target.length > 0) {
        let matches = 0;
        for (let j = 0; j < target.length; j++) {
          if (j < tw.length && target[j] === tw[j]) matches++;
        }
        wordAccuracy = matches / target.length;
      }
      const quality = calculateQuality(wordAccuracy, 1.0);
      const prog = this.store.getWordProgress(target);
      const updated = updateProgress(prog, quality, now);
      this.store.updateWordProgress(updated);
    }

    const overallAccuracy = totalTargetChars > 0 ? correctChars / totalTargetChars : 0;
    const durationMin = durationMs / 60000;
    const wpm = durationMin > 0 ? (totalTargetChars / 5) / durationMin : 0;

    let wordsCorrect = 0;
    for (const c of perWordCorrect) {
      if (c) wordsCorrect++;
    }

    const endedAt = now.toISOString();

    const record: SessionRecord = {
      startedAt,
      endedAt,
      wordsPracticed: words.length,
      avgWpm: wpm,
      accuracy: overallAccuracy,
      mode: "paragraph",
    };
    this.store.saveSession(record);

    return {
      words,
      typed: typedSlice,
      perWordCorrect,
      wpm,
      accuracy: overallAccuracy,
      wordsCorrect,
      wordsTotal: words.length,
      startedAt,
      endedAt,
    };
  }
}
