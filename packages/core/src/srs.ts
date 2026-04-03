import type { WordProgress } from "./store.js";

export const TARGET_WPM = 40.0;
export const MASTERY_REPS = 3;

/**
 * Maps typing performance to a 0-5 quality score for SM-2.
 * @param accuracy fraction of characters correct (0.0 to 1.0)
 * @param wpmRatio actual WPM / target WPM
 */
export function calculateQuality(accuracy: number, wpmRatio: number): number {
  if (accuracy < 0.5) return 0;
  if (accuracy < 0.75) return 1;
  if (accuracy < 0.9) return 2;
  if (wpmRatio < 0.5) return 3;
  if (wpmRatio < 0.9) return 4;
  return 5;
}

/**
 * Applies the SM-2 algorithm to update word progress.
 * Returns a new WordProgress with updated fields.
 */
export function updateProgress(
  p: WordProgress,
  quality: number,
  now: Date
): WordProgress {
  const result = { ...p };

  const q = quality;
  let ef = result.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ef = Math.max(ef, 1.3);

  result.easeFactor = ef;
  result.lastReviewed = now.toISOString();

  if (quality >= 3) {
    result.repetitions++;
    result.timesCorrect++;

    if (result.repetitions === 1) {
      result.intervalDays = 1;
    } else if (result.repetitions === 2) {
      result.intervalDays = 3;
    } else {
      result.intervalDays = result.intervalDays * ef;
    }
  } else {
    result.repetitions = 0;
    result.intervalDays = 0.01;
    result.timesIncorrect++;
  }

  const nextMs = now.getTime() + result.intervalDays * 24 * 60 * 60 * 1000;
  result.nextReview = new Date(nextMs).toISOString();

  return result;
}
