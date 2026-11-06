import type { TrainingSample } from './index.ts';
import { decodeSample } from './index.ts';
export type Pairing = { endpoint: string; token: string };
export function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  return parts.length === 4 && parts.every(p => Number.isInteger(p) && p >= 0 && p <= 255) &&
    (parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
}
export function parsePairing(uri: string): Pairing {
  const link = new URL(uri.trim());
  if (link.protocol !== 'aimotion:' || link.hostname !== 'pair') throw new Error('请粘贴电脑端生成的完整配对链接');
  const endpoint = link.searchParams.get('endpoint') || '';
  const token = link.searchParams.get('token') || '';
  const url = new URL(endpoint);
  if (url.protocol !== 'ws:' || !isPrivateIPv4(url.hostname) || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !/^[a-f0-9]{48}$/.test(token)) throw new Error('配对地址必须是电脑的局域网地址，且包含有效配对信息');
  return { endpoint, token };
}
export interface Outbox {
  put(sample: TrainingSample): void;
  pending(): TrainingSample[];
  ack(sessionId: string, seq: number): void;
}
/** Durable latest-per-session queue. Acknowledgements never clear a newer unsent update. */
export function acknowledge(outbox: Outbox, raw: unknown): boolean {
  const x = raw as { type?: string; sessionId?: string; seq?: number };
  if (!x || x.type !== 'ack' || typeof x.sessionId !== 'string' || !Number.isSafeInteger(x.seq) || x.seq! < 0) return false;
  outbox.ack(x.sessionId, x.seq!); return true;
}
export function enqueue(outbox: Outbox, raw: unknown) { const sample = decodeSample(raw); outbox.put(sample); return sample; }
