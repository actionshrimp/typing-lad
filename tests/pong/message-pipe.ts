/**
 * Message pipes for connecting two HeadlessPongPeers.
 *
 * DirectPipe: synchronous, zero-latency (for pure protocol tests)
 * RtcPipe: real WebRTC DataChannel via node-datachannel (for integration tests)
 */

import {
  RTCPeerConnection,
  RTCSessionDescription,
} from "node-datachannel/polyfill";
import type { PeerMessage } from "../../packages/web/src/pong/protocol";
import { HeadlessPongPeer } from "./headless-peer";
import { delay } from "./helpers";

// node-datachannel's RTCDataChannel type
type DataChannel = ReturnType<
  InstanceType<typeof RTCPeerConnection>["createDataChannel"]
>;

const encoder = new TextEncoder();

// --- DirectPipe (synchronous, deterministic) ---

export class DirectPipe {
  constructor(
    public host: HeadlessPongPeer,
    public client: HeadlessPongPeer,
  ) {}

  /** Tick both peers, then synchronously flush messages between them. */
  step(dt: number): void {
    this.host.tick(dt);
    this.client.tick(dt);
    this.flush();
  }

  /** Flush all pending messages between peers. */
  flush(): void {
    for (const msg of this.host.drainSentMessages()) {
      this.client.receive(msg);
    }
    for (const msg of this.client.drainSentMessages()) {
      this.host.receive(msg);
    }
  }
}

// --- RtcPipe (real WebRTC DataChannel) ---

export class RtcPipe {
  public host: HeadlessPongPeer;
  public client: HeadlessPongPeer;

  private pcHost: InstanceType<typeof RTCPeerConnection> | null = null;
  private pcClient: InstanceType<typeof RTCPeerConnection> | null = null;
  private dcHost: DataChannel | null = null;
  private dcClient: DataChannel | null = null;

  constructor(host: HeadlessPongPeer, client: HeadlessPongPeer) {
    this.host = host;
    this.client = client;
  }

  /** Establish a real WebRTC DataChannel between two peers (no signaling server). */
  async connect(): Promise<void> {
    // Create peer connections (no STUN needed for local test)
    this.pcHost = new RTCPeerConnection();
    this.pcClient = new RTCPeerConnection();

    // Host creates the DataChannel
    this.dcHost = this.pcHost.createDataChannel("pong", { ordered: true });

    // Client receives the DataChannel
    const clientDcReady = new Promise<void>((resolve) => {
      this.pcClient!.ondatachannel = (event: RTCDataChannelEvent) => {
        this.dcClient = event.channel as unknown as DataChannel;
        this.wireChannel(this.dcClient, this.client); // dcClient receives from host → deliver to client
        if (this.dcClient.readyState === "open") {
          resolve();
        } else {
          this.dcClient.onopen = () => resolve();
        }
      };
    });

    // Wire host's DataChannel (messages TO client)
    const hostDcReady = new Promise<void>((resolve) => {
      this.dcHost!.onopen = () => resolve();
    });
    this.wireChannel(this.dcHost, this.host); // dcHost receives from client → deliver to host

    // ICE candidate exchange (direct, no trickle)
    this.pcHost.onicecandidate = (evt) => {
      if (evt.candidate) {
        this.pcClient!.addIceCandidate(evt.candidate);
      }
    };
    this.pcClient.onicecandidate = (evt) => {
      if (evt.candidate) {
        this.pcHost!.addIceCandidate(evt.candidate);
      }
    };

    // SDP exchange
    const offer = await this.pcHost.createOffer();
    await this.pcHost.setLocalDescription(offer);
    await this.pcClient.setRemoteDescription(
      new RTCSessionDescription(offer as RTCSessionDescriptionInit),
    );

    const answer = await this.pcClient.createAnswer();
    await this.pcClient.setLocalDescription(answer);
    await this.pcHost.setRemoteDescription(
      new RTCSessionDescription(answer as RTCSessionDescriptionInit),
    );

    // Wait for both channels to open
    await Promise.all([hostDcReady, clientDcReady]);
  }

  /** Wire a DataChannel to deliver parsed messages to `receiver`. */
  private wireChannel(dc: DataChannel, receiver: HeadlessPongPeer): void {
    dc.onmessage = (event: MessageEvent) => {
      const text =
        typeof event.data === "string"
          ? event.data
          : Buffer.isBuffer(event.data)
            ? event.data.toString("utf-8")
            : new TextDecoder().decode(event.data as ArrayBuffer);
      const msg: PeerMessage = JSON.parse(text);
      receiver.receive(msg);
    };
  }

  /** Tick both peers, flush messages over DataChannel, yield for async delivery. */
  async step(dt: number): Promise<void> {
    this.host.tick(dt);
    this.client.tick(dt);
    await this.flush();
  }

  /** Send all pending outgoing messages over the real DataChannel. */
  async flush(): Promise<void> {
    for (const msg of this.host.drainSentMessages()) {
      this.dcHost!.send(encoder.encode(JSON.stringify(msg)));
    }
    for (const msg of this.client.drainSentMessages()) {
      this.dcClient!.send(encoder.encode(JSON.stringify(msg)));
    }
    // Yield time for async DataChannel delivery
    await delay(10);
  }

  dispose(): void {
    this.dcHost?.close();
    this.dcClient?.close();
    this.pcHost?.close();
    this.pcClient?.close();
  }
}
