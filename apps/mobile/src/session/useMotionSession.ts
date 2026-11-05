import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { MotionSession } from '../../../../packages/session-core/src/session.ts';
import type { RoundResult, SessionSnapshot } from '../../../../packages/session-core/src/session.ts';
import type { PoseSource, Viewport } from '../../../../packages/session-core/src/sources.ts';
import { createGame } from '../../../../packages/game-core/src/index.ts';

const clock = () => performance.now();

export function useMotionSession<T extends PoseSource>(createSource: () => T, viewport: Viewport,
  sourceKind: PoseSource['kind'], onResult: (result: RoundResult) => void) {
  const runtime = useRef<{ session: MotionSession; source: T } | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => ({ game: createGame(sourceKind), pose: null,
    transform: null, tracking: 'lost', confidence: 0, issue: null, result: null }));
  const delivered = useRef<RoundResult | null>(null);

  useEffect(() => {
    const source = createSource();
    const session = new MotionSession(source);
    runtime.current = { source, session };
    setSnapshot(session.snapshot);
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') setSnapshot(session.pause(clock()));
    });
    return () => {
      listener.remove();
      if (runtime.current?.session === session) runtime.current = null;
      try { session.dispose(); } catch { console.warn('[AI Motion] input cleanup failed'); }
    };
  }, [createSource]);

  useEffect(() => {
    const session = runtime.current?.session;
    if (!session) return;
    session.setViewport(viewport);
    setSnapshot(session.snapshot);
  }, [viewport.width, viewport.height, createSource]);

  useEffect(() => {
    const session = runtime.current?.session;
    if (!session || snapshot.game.phase !== 'running') return;
    const timer = setInterval(() => setSnapshot(session.tick(clock())), 50);
    return () => clearInterval(timer);
  }, [snapshot.game.phase, createSource]);

  useEffect(() => {
    if (!snapshot.result) { delivered.current = null; return; }
    if (snapshot.result !== delivered.current) {
      delivered.current = snapshot.result;
      onResult(snapshot.result);
    }
  }, [snapshot.result, onResult]);

  const command = useCallback((action: 'start' | 'pause' | 'resume' | 'finish') => {
    const session = runtime.current?.session;
    if (session) setSnapshot(session[action](clock()));
  }, []);
  const withSource = useCallback((action: (source: T) => void) => {
    if (runtime.current) action(runtime.current.source);
  }, []);

  return { snapshot, command, withSource };
}
