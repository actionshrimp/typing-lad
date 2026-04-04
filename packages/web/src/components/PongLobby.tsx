import React, { useState, useCallback, useRef, useEffect } from "react";
import { PongNet, type NetStatus, type PongNetLike } from "../pong/net";
import { BotNet } from "../pong/bot";
import type { PeerMessage } from "../pong/protocol";

interface PongLobbyProps {
  onReady: (opts: { net: PongNetLike; isPlayer1: boolean }) => void;
  onCancel: () => void;
}

export function PongLobby({ onReady, onCancel }: PongLobbyProps) {
  const [status, setStatus] = useState<NetStatus>("idle");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [startReceived, setStartReceived] = useState(false);
  const netRef = useRef<PongNet | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const startSentRef = useRef(false);
  const isHostRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (netRef.current && netRef.current.status !== "connected") {
        netRef.current.dispose();
      }
    };
  }, []);

  // When both sides have sent start, fire onReady
  useEffect(() => {
    if (startReceived && startSentRef.current && netRef.current) {
      onReadyRef.current({ net: netRef.current, isPlayer1: isHostRef.current });
    }
  }, [startReceived]);

  const createNet = useCallback((): PongNet => {
    const net = new PongNet();
    net.onStatusChange = (s: NetStatus) => {
      setStatus(s);
      if (s === "connected") {
        setPeerConnected(true);
      }
      if (s === "error") {
        setError("Connection failed. Try again.");
      }
    };
    net.onMessage = (msg: PeerMessage) => {
      if (msg.type === "start") {
        setStartReceived(true);
        // Auto-send start back if we haven't yet
        if (!startSentRef.current) {
          startSentRef.current = true;
          net.send({ type: "start" });
        }
      }
    };
    net.onError = (err: string) => {
      setError(err);
    };
    netRef.current = net;
    return net;
  }, []);

  const handleCreate = useCallback(() => {
    setError("");
    setIsHost(true);
    isHostRef.current = true;
    const net = createNet();
    const code = net.createRoom();
    setRoomCode(code);
  }, [createNet]);

  const handleJoin = useCallback(() => {
    if (joinCode.length !== 4) {
      setError("Enter a 4-character room code.");
      return;
    }
    setError("");
    setIsHost(false);
    isHostRef.current = false;
    const net = createNet();
    net.joinRoom(joinCode);
  }, [joinCode, createNet]);

  const handleStart = useCallback(() => {
    if (netRef.current && !startSentRef.current) {
      startSentRef.current = true;
      netRef.current.send({ type: "start" });
      // If we already received start from peer, fire onReady
      setStartReceived((prev) => {
        if (prev && netRef.current) {
          onReadyRef.current({ net: netRef.current, isPlayer1: isHostRef.current });
        }
        return prev;
      });
    }
  }, []);

  const handlePlayBot = useCallback(() => {
    const botNet = new BotNet();
    onReadyRef.current({ net: botNet, isPlayer1: true });
  }, []);

  const handleReset = useCallback(() => {
    netRef.current?.dispose();
    netRef.current = null;
    setStatus("idle");
    setRoomCode("");
    setError("");
    setPeerConnected(false);
    setStartReceived(false);
    startSentRef.current = false;
  }, []);

  const statusLabel = (() => {
    switch (status) {
      case "creating": return "Setting up room...";
      case "waiting": return "Waiting for opponent...";
      case "connecting": return "Connecting...";
      case "connected": return "Connected!";
      case "disconnected": return "Disconnected";
      case "error": return "Error";
      default: return "";
    }
  })();

  return (
    <div className="flex flex-col items-center gap-6 max-w-md mx-auto pt-12">
      <h1 className="text-2xl font-bold text-text-primary">Multiplayer Pong</h1>
      <p className="text-sm text-text-secondary text-center">
        Play pong against a friend! Each player types words to control their paddle.
      </p>

      {status === "idle" && (
        <div className="flex flex-col gap-4 w-full">
          <button
            onClick={handlePlayBot}
            className="w-full px-6 py-3 rounded-lg bg-correct text-surface font-semibold hover:bg-correct/90 transition-colors"
          >
            Play vs Bot
          </button>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-dim uppercase tracking-wider">or play a friend</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            onClick={handleCreate}
            className="w-full px-6 py-3 rounded-lg bg-accent text-surface font-semibold hover:bg-accent/90 transition-colors"
          >
            Create Room
          </button>

          <div className="flex gap-2">
            <input
              type="text"
              maxLength={4}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              className="flex-1 px-4 py-3 rounded-lg border border-border bg-surface text-text-primary font-mono text-center text-lg tracking-[0.3em] uppercase placeholder:text-text-dim"
            />
            <button
              onClick={handleJoin}
              className="px-6 py-3 rounded-lg border border-info text-info font-semibold hover:bg-info/10 transition-colors"
            >
              Join
            </button>
          </div>
        </div>
      )}

      {(status === "creating" || status === "waiting") && (
        <div className="flex flex-col items-center gap-4">
          <div className="text-sm text-text-secondary">{statusLabel}</div>
          {roomCode && (
            <div className="flex flex-col items-center gap-2">
              <div className="text-xs text-text-dim uppercase tracking-wider">Room Code</div>
              <div className="text-4xl font-mono font-bold text-accent tracking-[0.4em]">
                {roomCode}
              </div>
              <div className="text-xs text-text-dim">
                Share this code with your opponent
              </div>
            </div>
          )}
        </div>
      )}

      {status === "connecting" && (
        <div className="text-sm text-text-secondary">{statusLabel}</div>
      )}

      {peerConnected && !startSentRef.current && (
        <div className="flex flex-col items-center gap-4">
          <div className="text-sm text-correct font-medium">Connected!</div>
          <button
            onClick={handleStart}
            className="px-8 py-3 rounded-lg bg-correct text-surface font-bold text-lg hover:bg-correct/90 transition-colors"
          >
            Start Game
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm text-incorrect">{error}</div>
      )}

      {status !== "idle" && !peerConnected && (
        <button
          onClick={handleReset}
          className="text-sm text-text-dim hover:text-text-secondary transition-colors"
        >
          Cancel
        </button>
      )}

      <button
        onClick={onCancel}
        className="text-xs text-text-dim hover:text-text-secondary transition-colors mt-4"
      >
        Back to menu
      </button>
    </div>
  );
}
