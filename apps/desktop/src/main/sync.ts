import { WebSocketServer, WebSocket } from "ws";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { networkInterfaces } from "node:os";
import type { Store } from "./store.ts";
import type { TrainingRecord } from "../../../../packages/training-core/src/index.ts";
import { isPrivateIPv4 } from "../../../../packages/training-core/src/client.ts";

export class SyncService {
  private server: WebSocketServer | null = null;
  private token = "";
  private expires = 0;
  private port = 0;
  private peers = new Map<WebSocket, { id: string; seen: number }>();
  live: TrainingRecord | null = null;
  error: string | null = null;
  private store: Store;
  constructor(store: Store) {
    this.store = store;
  }
  status() {
    const now = Date.now();
    const hosts = Object.values(networkInterfaces())
      .flat()
      .filter(
        (i) =>
          i && i.family === "IPv4" && !i.internal && isPrivateIPv4(i.address),
      )
      .map((i) => i!.address);
    const endpoints =
      this.server && now < this.expires
        ? hosts.map((host) => ({
            host,
            uri: `aimotion://pair?endpoint=${encodeURIComponent(`ws://${host}:${this.port}`)}&token=${this.token}`,
          }))
        : [];
    return {
      enabled: !!this.server,
      expiresAt: this.expires,
      endpoints,
      peers: [...this.peers.values()].map((p) => ({
        ...p,
        stale: now - p.seen > 3500,
      })),
      error: this.error,
    };
  }
  async start() {
    if (this.server) return this.status();
    this.error = null;
    this.token = randomBytes(24).toString("hex");
    this.expires = Date.now() + 12 * 3600000;
    const server = new WebSocketServer({
      host: "0.0.0.0",
      port: 0,
      maxPayload: 16384,
      perMessageDeflate: false,
    });
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    this.server = server;
    this.port = (server.address() as { port: number }).port;
    server.on("error", () => {
      this.error = "局域网连接服务异常，请关闭后重新开启";
    });
    server.on("connection", (socket, request) => {
      // Native clients have no Origin. Reject browser-origin requests to this LAN-only ingestion endpoint.
      if (request.headers.origin || server.clients.size > 8) {
        socket.close(1008);
        return;
      }
      let authenticated = false;
      let count = 0,
        windowStart = Date.now();
      const authTimer = setTimeout(() => {
        if (!authenticated) socket.close(1008);
      }, 5000);
      socket.on("error", () => {});
      socket.on("close", () => {
        clearTimeout(authTimer);
        this.peers.delete(socket);
      });
      socket.on("message", (bytes) => {
        try {
          const now = Date.now();
          if (now > this.expires) {
            socket.close(1008, "Pair again");
            return;
          }
          if (now - windowStart > 1000) {
            count = 0;
            windowStart = now;
          }
          if (++count > 30) throw new Error("同步过于频繁");
          const message = JSON.parse(bytes.toString());
          if (!authenticated) {
            const candidate = Buffer.from(
              typeof message.token === "string" ? message.token : "",
            );
            const expected = Buffer.from(this.token);
            if (
              message.type !== "auth" ||
              candidate.length !== expected.length ||
              !timingSafeEqual(candidate, expected) ||
              typeof message.deviceId !== "string" ||
              !/^[\w-]{8,100}$/.test(message.deviceId)
            )
              throw new Error("配对信息无效");
            authenticated = true;
            clearTimeout(authTimer);
            this.peers.set(socket, { id: message.deviceId, seen: now });
            socket.send(JSON.stringify({ type: "ready", version: 1 }));
          } else if (message.type === "sample") {
            const peer = this.peers.get(socket)!;
            const result = this.store.ingest(message.sample, peer.id);
            peer.seen = now;
            if (result.accepted) this.live = result.record;
            socket.send(
              JSON.stringify({
                type: "ack",
                sessionId: result.record.sessionId,
                seq: result.record.seq,
              }),
            );
          } else if (message.type === "ping") {
            this.peers.get(socket)!.seen = now;
            socket.send(JSON.stringify({ type: "pong" }));
          } else throw new Error("未知消息");
        } catch {
          socket.send(
            JSON.stringify({
              type: "error",
              message: "同步数据被拒绝，请检查版本或重新配对",
            }),
          );
          socket.close(1008);
        }
      });
    });
    return this.status();
  }
  async stop() {
    const server = this.server;
    this.server = null;
    this.token = "";
    this.expires = 0;
    this.peers.clear();
    this.live = null;
    if (server) {
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}
