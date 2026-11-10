/** Exécution parallèle des calculs du solveur avec des worker threads (le fichier groupé se relance lui-même). */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import type { RunConfig } from '@chabfu/engine';
import type { JobResult } from './report.js';
import { applyOverrides } from './overrides.js';
import { solveBest, type SolverOptions } from './solver.js';

export interface Job {
  config: RunConfig;
  deckName: string;
  stuffName: string;
  noWalk: boolean;
  options: Partial<SolverOptions>;
  /** Réglages `--set` à appliquer avant le calcul (voir overrides.ts). */
  overrides: string[];
}

export function availableCpus(): number {
  return availableParallelism();
}

let appliedOverrides: string | null = null;

export function runJob(job: Job): JobResult {
  // Chaque worker applique les réglages une seule fois (tous les calculs d'un lancement partagent les mêmes).
  const key = JSON.stringify(job.overrides);
  if (appliedOverrides === null) {
    applyOverrides(job.overrides);
    appliedOverrides = key;
  } else if (appliedOverrides !== key) throw new Error('Réglages différents dans un même processus.');
  return { ...solveBest(job.config, job.options), deckName: job.deckName, stuffName: job.stuffName, noWalk: job.noWalk };
}

export async function runJobs(jobs: Job[], parallel: number, onResult: (r: JobResult, done: number) => void): Promise<JobResult[]> {
  const results: JobResult[] = new Array(jobs.length);
  let nextIndex = 0;
  let done = 0;
  const workerCount = Math.max(1, Math.min(parallel, jobs.length));
  if (workerCount === 1) {
    for (let i = 0; i < jobs.length; i++) {
      results[i] = runJob(jobs[i]);
      onResult(results[i], ++done);
    }
    return results;
  }
  await Promise.all(
    Array.from({ length: workerCount }, () =>
      new Promise<void>((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { solverWorker: true } });
        const feed = () => {
          if (nextIndex >= jobs.length) {
            void worker.terminate().then(() => resolve());
            return;
          }
          const index = nextIndex++;
          worker.postMessage({ index, job: jobs[index] });
        };
        worker.on('message', (msg: { index: number; result: JobResult }) => {
          results[msg.index] = msg.result;
          onResult(msg.result, ++done);
          feed();
        });
        worker.on('error', reject);
        feed();
      }),
    ),
  );
  return results;
}

// Côté worker : le même fichier groupé est chargé dans le thread et répond aux calculs.
if (!isMainThread && (workerData as { solverWorker?: boolean } | null)?.solverWorker) {
  parentPort!.on('message', (msg: { index: number; job: Job }) => {
    parentPort!.postMessage({ index: msg.index, result: runJob(msg.job) });
  });
}
