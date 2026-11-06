import { openDatabaseSync } from 'expo-sqlite';
import { AppState } from 'react-native';
import { acknowledge, parsePairing } from '../../../../packages/training-core/src/client.ts';
import type { TrainingSample } from '../../../../packages/training-core/src/index.ts';
import type { SessionSnapshot } from '../../../../packages/session-core/src/session.ts';

type Status = { state: 'offline' | 'connecting' | 'connected' | 'retrying' | 'error'; message: string };
const id = () => `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
let database: ReturnType<typeof openDatabaseSync> | null = null;
function db() {
  if (!database) {
    database = openDatabaseSync('ai-motion.sqlite');
    database.execSync('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY,data TEXT NOT NULL,pending INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);');
  }
  return database;
}
const outbox = {
  put(sample: TrainingSample) { db().runSync('INSERT OR REPLACE INTO history VALUES (?,?,1)', sample.sessionId, JSON.stringify(sample)); },
  pending() { return db().getAllSync<{ data: string }>('SELECT data FROM history WHERE pending=1 ORDER BY rowid LIMIT 1000').map(row => JSON.parse(row.data) as TrainingSample); },
  ack(sessionId: string, seq: number) { const row = db().getFirstSync<{ data: string }>('SELECT data FROM history WHERE id=?', sessionId); if (row && (JSON.parse(row.data) as TrainingSample).seq <= seq) db().runSync('UPDATE history SET pending=0 WHERE id=?', sessionId); },
};
let socket: WebSocket | null = null;
let pairing: ReturnType<typeof parsePairing> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let authDeadline: ReturnType<typeof setTimeout> | null = null;
let status: Status = { state: 'offline', message: '尚未连接电脑，训练记录保存在手机本地。' };
let ready = false, attempt = 0, suspended = false, lastServerSeen = 0;
const listeners = new Set<() => void>();
const update = (value: Status) => { status = value; listeners.forEach(listener => listener()); };
function deviceId() { let row = db().getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key=?', 'deviceId'); if (!row) { row = { value: id() }; db().runSync('INSERT INTO settings VALUES (?,?)', 'deviceId', row.value); } return row.value; }
function flush() { if (ready && socket?.readyState === WebSocket.OPEN) for (const sample of outbox.pending().slice(0, 8)) socket.send(JSON.stringify({ type: 'sample', sample })); }
function closeSocket() {
  if (heartbeat) clearInterval(heartbeat); heartbeat = null;
  if (authDeadline) clearTimeout(authDeadline); authDeadline = null;
  ready = false;
  const old = socket; socket = null; old?.close();
}
function open() {
  if (!pairing || suspended) return;
  closeSocket();
  update({ state: 'connecting', message: '正在连接电脑…' });
  const current = new WebSocket(pairing.endpoint); socket = current;
  authDeadline = setTimeout(() => { if (socket === current && !ready) current.close(); }, 8000);
  current.onopen = () => { if (socket === current && pairing) current.send(JSON.stringify({ type: 'auth', token: pairing.token, deviceId: deviceId() })); };
  current.onmessage = event => {
    if (socket !== current) return;
    lastServerSeen = Date.now();
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'ready') {
        ready = true; attempt = 0; if (authDeadline) clearTimeout(authDeadline);
        update({ state: 'connected', message: '已连接电脑，正在同步本地记录。' });
        flush(); heartbeat = setInterval(() => {
          if (Date.now() - lastServerSeen > 8000) { current.close(); return; }
          if (ready && current.readyState === WebSocket.OPEN) { current.send(JSON.stringify({ type: 'ping' })); flush(); }
        }, 2000);
      } else if (message.type === 'ack') { acknowledge(outbox, message); listeners.forEach(listener => listener()); }
      else if (message.type === 'error') { pairing = null; update({ state: 'error', message: '电脑拒绝同步，请重新复制配对链接；本地记录仍保留。' }); current.close(); }
    } catch { update({ state: 'error', message: '同步响应无法读取，请检查电脑端版本。' }); }
  };
  current.onerror = () => {};
  current.onclose = event => {
    if (socket !== current) return;
    closeSocket();
    if (event.code === 1008) { pairing = null; update({ state: 'error', message: '配对已失效，请重新连接电脑。' }); return; }
    if (pairing && !suspended) { update({ state: 'retrying', message: '连接中断，将自动重试；训练记录仍保存在手机。' }); retry = setTimeout(open, Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5))); }
  };
}
let lifecycle: ReturnType<typeof AppState.addEventListener> | null = null;
export const trainingSync = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  status: () => status,
  initialize() {
    db();
    if (!lifecycle) lifecycle = AppState.addEventListener('change', state => { suspended = state !== 'active'; if (suspended) { if (retry) clearTimeout(retry); closeSocket(); update({ state: 'offline', message: '应用在后台，连接已暂停，记录仍保留。' }); } else if (pairing) open(); });
  },
  connect(uri: string) { const parsed = parsePairing(uri); this.disconnect(); pairing = parsed; this.initialize(); suspended = AppState.currentState !== 'active'; open(); },
  disconnect() { pairing = null; if (retry) clearTimeout(retry); retry = null; closeSocket(); update({ state: 'offline', message: '已断开电脑，训练记录仍保存在手机。' }); },
  history(): TrainingSample[] { return db().getAllSync<{ data: string }>('SELECT data FROM history ORDER BY rowid DESC LIMIT 100').map(row => JSON.parse(row.data)); },
  pendingCount() { return db().getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM history WHERE pending=1')?.count ?? 0; },
  publish(sample: TrainingSample) { outbox.put(sample); flush(); listeners.forEach(listener => listener()); },
};

/** Mobile telemetry throttles to 1 Hz, immediately flushing lifecycle transitions. */
export function createTelemetry() {
  let sample: TrainingSample | null = null;
  let previousPhase = 'idle', lastWrite = -Infinity;
  return {
    capture(snapshot: SessionSnapshot) {
      const game = snapshot.game;
      if (game.phase === 'idle') return;
      if (game.phase === 'finished' && sample?.phase === 'finished') return;
      if (game.phase === 'running' && (previousPhase === 'idle' || previousPhase === 'finished')) {
        sample = { version: 1, sessionId: id(), seq: 0, startedAt: new Date().toISOString(), source: game.source,
          activity: 'Motion Catch', phase: 'running', activeMs: 0, reps: 0, tracking: 'lost', confidence: 0 };
        lastWrite = -Infinity;
      }
      if (!sample) return;
      const now = performance.now();
      if (now - lastWrite >= 1000 || game.phase !== previousPhase) {
        sample = { ...sample, seq: sample.seq + 1, phase: game.phase, activeMs: Math.round(game.elapsedMs),
          reps: game.hitTimesMs.length, tracking: snapshot.tracking, confidence: snapshot.confidence };
        trainingSync.publish(sample); lastWrite = now;
      }
      previousPhase = game.phase;
    },
    leave() { if (sample && sample.phase === 'running') { sample = { ...sample, seq: sample.seq + 1, phase: 'paused' }; trainingSync.publish(sample); } },
  };
}
