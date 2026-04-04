// --- Multiplayer Pong Protocol Messages ---

// Both directions
export interface HelloMsg {
  type: "hello";
  words: { word: string; yPosition: number }[];
}

export interface TypingMsg {
  type: "typing";
  targetIds: number[];
  typedPrefix: string;
}

export interface WordDoneMsg {
  type: "word_done";
  slotIndex: number;
  newWord: string;
  paddleTargetY: number;
  word: string;
  typed: string;
  durationMs: number;
}

// From host when ball bounces off either paddle
export interface HitMsg {
  type: "hit";
  ballVx: number;
  ballVy: number;
  ballX: number;
  ballY: number;
  rallyHits: number;
}

// From host — authoritative serve with current scores
export interface ServeMsg {
  type: "serve";
  ballVx: number;
  ballVy: number;
  leftScore: number;
  rightScore: number;
}

// Game start signal
export interface StartMsg {
  type: "start";
}

export type PeerMessage =
  | HelloMsg
  | TypingMsg
  | WordDoneMsg
  | HitMsg
  | ServeMsg
  | StartMsg;
