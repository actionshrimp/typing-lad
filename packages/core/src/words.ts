/** Keyboard zone difficulty level. */
export const Level = {
  HomeRow: 1,
  TopRow: 2,
  BottomRow: 3,
  FullAlpha: 4,
} as const;

export type Level = (typeof Level)[keyof typeof Level];

export interface Word {
  text: string;
  level: Level;
  rank: number;
}

export const LEVEL_NAMES: Record<Level, string> = {
  [Level.HomeRow]: "Home Row",
  [Level.TopRow]: "Top Row",
  [Level.BottomRow]: "Bottom Row",
  [Level.FullAlpha]: "Full Alpha",
};

const homeRowKeys = "asdfghjkl";
const topRowKeys = homeRowKeys + "qwertyuiop";
const bottomRowKeys = topRowKeys + "zxcvbnm";

export function keysForLevel(level: Level): string {
  switch (level) {
    case Level.HomeRow:
      return homeRowKeys;
    case Level.TopRow:
      return topRowKeys;
    case Level.BottomRow:
    case Level.FullAlpha:
      return bottomRowKeys;
    default:
      return "";
  }
}

export function usesOnlyKeys(text: string, keys: string): boolean {
  for (const ch of text) {
    if (!keys.includes(ch)) return false;
  }
  return true;
}

function makeWords(level: Level, texts: string[]): Word[] {
  return texts.map((text, i) => ({ text, level, rank: i + 1 }));
}

const homeRowWords = makeWords(Level.HomeRow, [
  "a", "as", "ad", "ah", "ha", "la",
  "add", "ads", "ahs", "all", "ash", "ask",
  "dad", "fad", "gag", "gal", "gas", "had",
  "hag", "has", "jag", "lag", "lad", "lass",
  "sad", "sag", "shall", "shag", "slag",
  "glad", "dash", "gash", "lash", "hash",
  "flash", "flask", "glass", "salad", "slash",
  "fall", "hall", "half", "gaff",
]);

const topRowWords = makeWords(Level.TopRow, [
  "the", "is", "it", "to", "of", "he", "we",
  "at", "or", "if", "so", "up", "do", "go",
  "this", "that", "with", "they", "your",
  "what", "will", "just", "said", "its",
  "were", "like", "our", "his", "her",
  "did", "get", "use", "out", "got",
  "who", "old", "let", "put", "set",
  "also", "she", "for", "are", "was",
  "off", "see", "too", "day", "way",
  "oil", "sit", "hot", "yet", "try",
  "top", "red", "tie", "eye", "dog",
  "high", "keep", "side", "still", "where",
  "right", "while", "world", "light", "their",
  "house", "those", "after", "other", "would",
  "year", "first", "these", "third", "thought",
  "head", "left", "page", "work", "life",
  "edit", "told", "here", "type", "quote",
  "quite", "figure", "leader", "fight", "wish",
]);

const bottomRowWords = makeWords(Level.BottomRow, [
  "in", "on", "an", "no", "am",
  "can", "but", "not", "one", "man",
  "run", "own", "now", "new", "two",
  "been", "come", "back", "much", "name",
  "even", "know", "only", "most", "give",
  "some", "time", "than", "once", "from",
  "them", "when", "then", "have", "made",
  "more", "long", "make", "many", "over",
  "such", "down", "number", "became",
  "never", "begin", "cabin", "bacon", "bunch",
  "climb", "combine", "album", "blank",
  "above", "before", "chance", "dance",
  "examine", "connect", "balance", "consider",
  "machine", "becoming", "blacksmith",
  "convince", "excellent", "uncommon",
]);

const fullAlphaWords = makeWords(Level.FullAlpha, [
  "question", "example", "between", "because",
  "government", "important", "different", "education",
  "following", "possible", "children", "remember",
  "together", "something", "personal", "recognize",
  "anything", "everybody", "knowledge", "beautiful",
  "community", "beginning", "certainly", "character",
  "challenge", "dangerous", "equipment", "establish",
  "furniture", "guarantee", "happiness", "influence",
  "journalist", "landscape", "meanwhile", "necessary",
  "operation", "paragraph", "qualified", "recommend",
  "satisfied", "technique", "universal", "volunteer",
  "wonderful", "apologize", "breakfast", "celebrate",
  "democracy", "emphasize", "fantastic", "gratitude",
]);

const _allWords: Word[] = [
  ...homeRowWords,
  ...topRowWords,
  ...bottomRowWords,
  ...fullAlphaWords,
];

export function allWords(): Word[] {
  return [..._allWords];
}

export function wordsByLevel(level: Level): Word[] {
  return _allWords.filter((w) => w.level === level);
}

export function wordByText(text: string): Word | undefined {
  return _allWords.find((w) => w.text === text);
}
