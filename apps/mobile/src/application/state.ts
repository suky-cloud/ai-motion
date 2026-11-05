import type { RoundResult } from '../../../../packages/session-core/src/session.ts';

/** Application navigation stays independent of the React screen tree. */
export type Route = { name: 'home' } | { name: 'camera' | 'simulation'; key: number };
export type LastRound = { schemaVersion: 1; result: RoundResult; completedAt: string };
export type ApplicationState = { route: Route; nextRouteKey: number; lastRound: LastRound | null };
export type AppAction = { type: 'open'; screen: 'camera' | 'simulation' } | { type: 'home' } |
  { type: 'record-result'; result: RoundResult; completedAt: string } | { type: 'clear-result' };

export const initialAppState: ApplicationState = { route: { name: 'home' }, nextRouteKey: 1, lastRound: null };
export function appReducer(state: ApplicationState, action: AppAction): ApplicationState {
  switch (action.type) {
    case 'open': return { ...state, route: { name: action.screen, key: state.nextRouteKey }, nextRouteKey: state.nextRouteKey + 1 };
    case 'home': return { ...state, route: { name: 'home' }, nextRouteKey: state.nextRouteKey + 1 };
    case 'record-result': return { ...state, lastRound: { schemaVersion: 1, completedAt: action.completedAt, result: { ...action.result } } };
    case 'clear-result': return { ...state, lastRound: null };
  }
}
