import Peer, { type DataConnection } from "peerjs";
import type { PeerMessage } from "./protocol";

export type NetStatus =
  | "idle"
  | "creating"
  | "waiting"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

/** Minimal interface shared by PongNet and BotNet. */
export interface PongNetLike {
  onStatusChange: ((status: NetStatus) => void) | null;
  onMessage: ((msg: PeerMessage) => void) | null;
  onError: ((err: string) => void) | null;
  readonly status: NetStatus;
  send(msg: PeerMessage): void;
  dispose(): void;
}

// Ambiguity-free charset (no 0/O, 1/I/L)
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 4;
const PEER_PREFIX = "typing-lad-";

// STUN servers for ICE candidate discovery (direct peer-to-peer).
// No TURN relay — connections across symmetric NATs may fail.
// For cross-NAT support, add a TURN server (e.g. metered.ca free tier).
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LEN; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

export class PongNet {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private _status: NetStatus = "idle";
  private _roomCode = "";

  // Public assignable callbacks
  onStatusChange: ((status: NetStatus) => void) | null = null;
  onMessage: ((msg: PeerMessage) => void) | null = null;
  onError: ((err: string) => void) | null = null;

  get status(): NetStatus {
    return this._status;
  }
  get roomCode(): string {
    return this._roomCode;
  }

  private setStatus(s: NetStatus): void {
    this._status = s;
    this.onStatusChange?.(s);
  }

  createRoom(): string {
    this._roomCode = randomCode();
    this.setStatus("creating");

    this.peer = new Peer(PEER_PREFIX + this._roomCode, {
      config: {
        iceServers: ICE_SERVERS,
      },
    });

    this.peer.on("open", () => {
      this.setStatus("waiting");
    });

    this.peer.on("connection", (conn) => {
      this.conn = conn;
      this.setStatus("connecting");
      this.wireConnection(conn);
    });

    this.peer.on("error", (err) => {
      this.onError?.(err.message ?? String(err));
      this.setStatus("error");
    });

    return this._roomCode;
  }

  joinRoom(code: string): void {
    this._roomCode = code.toUpperCase();
    this.setStatus("connecting");

    this.peer = new Peer({
      config: {
        iceServers: ICE_SERVERS,
      },
    });

    this.peer.on("open", () => {
      const conn = this.peer!.connect(PEER_PREFIX + this._roomCode, {
        reliable: true,
      });
      this.conn = conn;
      this.wireConnection(conn);
    });

    this.peer.on("error", (err) => {
      this.onError?.(err.message ?? String(err));
      this.setStatus("error");
    });
  }

  private wireConnection(conn: DataConnection): void {
    conn.on("open", () => {
      this.setStatus("connected");
    });

    conn.on("data", (data) => {
      this.onMessage?.(data as PeerMessage);
    });

    conn.on("close", () => {
      this.setStatus("disconnected");
    });

    conn.on("error", (err) => {
      this.onError?.(String(err));
      this.setStatus("error");
    });
  }

  send(msg: PeerMessage): void {
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    }
  }

  dispose(): void {
    this.conn?.close();
    this.peer?.destroy();
    this.conn = null;
    this.peer = null;
    this._status = "idle";
  }
}
