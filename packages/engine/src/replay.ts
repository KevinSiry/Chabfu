import { applyAction, createRun } from './combat.js';
import type { Action, RunConfig, RunState } from './types.js';

export interface RunScore {
  dungeonId: string;
  difficulty: number;
  turns: number;
  timeMs: number;
}

/** Rejoue une suite d'actions depuis zéro. Lève une erreur si une action est illégale. */
export function replayRun(config: RunConfig, actions: Action[]): RunState {
  let state = createRun(config);
  for (const action of actions) state = applyAction(state, action).state;
  return state;
}

/**
 * Validation serveur d'un score : rejoue le run et vérifie qu'il est gagné avec le nombre de tours annoncé.
 * Le chrono, lui, doit être horodaté par le serveur (début et fin du run).
 */
export function verifyRun(config: RunConfig, actions: Action[], claimedTurns: number): { valid: boolean; reason?: string } {
  try {
    const state = replayRun(config, actions);
    if (state.status !== 'won') return { valid: false, reason: 'Le run rejoué n’est pas une victoire.' };
    if (state.turn !== claimedTurns) return { valid: false, reason: `Tours annoncés ${claimedTurns}, rejoués ${state.turn}.` };
    return { valid: true };
  } catch (e) {
    return { valid: false, reason: (e as Error).message };
  }
}

/** Ordre du classement : difficulté la plus haute, puis moins de tours, puis meilleur chrono. */
export function compareScores(a: RunScore, b: RunScore): number {
  return b.difficulty - a.difficulty || a.turns - b.turns || a.timeMs - b.timeMs;
}
